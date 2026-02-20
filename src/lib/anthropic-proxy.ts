import type { SelfState } from '@/core/types';
import { parseShiftFromText, updateCognitiveState } from '@/lib/cognitive/state-updater';

/**
 * Proxy a streaming SSE response from the Anthropic API, filtering out
 * SHIFT lines from text content_block_delta events.
 *
 * Strategy: pass all non-text events through immediately. Buffer text_delta
 * events only when we suspect SHIFT content is starting. At stream end,
 * drop buffered text events that contain SHIFT, but always emit non-text
 * control events (content_block_stop, message_delta, message_stop).
 */
export function createShiftFilteringStream(
  upstreamResponse: Response,
  userId: string,
  selfState: SelfState,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const upstreamBody = upstreamResponse.body!;

  // Accumulated text across all text_delta events (for SHIFT detection)
  let accumulatedText = '';
  // Buffered text_delta SSE events (held when we suspect SHIFT is starting)
  let pendingTextEvents: string[] = [];
  // Whether we're buffering text events
  let buffering = false;

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const raw = decoder.decode(chunk, { stream: true });
      // Split into SSE events by double-newline. We process each complete event.
      // sseRemainder holds any partial event at the end.
      processRaw(raw, controller);
    },
    flush(controller) {
      // Process any remaining data in the SSE buffer
      if (sseRemainder.trim()) {
        processEvent(sseRemainder, controller);
      }

      // At stream end, handle buffered events and SHIFT extraction
      if (accumulatedText) {
        const { emotionShift } = parseShiftFromText('\n' + accumulatedText);
        if (emotionShift) {
          updateCognitiveState(userId, selfState, emotionShift).catch(() => {});
        }
      }

      // Flush pending text events — drop SHIFT content, keep non-SHIFT
      if (pendingTextEvents.length > 0) {
        const shiftStart = findShiftBlockStart(accumulatedText);
        if (shiftStart < 0) {
          // No SHIFT found — flush all pending text events
          for (const evt of pendingTextEvents) {
            controller.enqueue(encoder.encode(evt + '\n\n'));
          }
        }
        // If SHIFT found, drop the buffered text events (they contain SHIFT data)
        pendingTextEvents = [];
      }

      // Non-text events now pass through immediately, no flush needed
    },
  });

  // SSE parsing state
  let sseRemainder = '';
  // Non-text events now pass through immediately (not buffered)

  function processRaw(raw: string, controller: TransformStreamDefaultController<Uint8Array>) {
    sseRemainder += raw;
    const parts = sseRemainder.split('\n\n');
    sseRemainder = parts.pop() ?? '';

    for (const part of parts) {
      if (!part.trim()) {
        // Empty SSE keep-alive
        controller.enqueue(encoder.encode('\n\n'));
        continue;
      }
      processEvent(part, controller);
    }
  }

  function processEvent(event: string, controller: TransformStreamDefaultController<Uint8Array>) {
    const { eventType, dataStr, isTextDelta, text } = parseSSEEvent(event);

    if (isTextDelta && text !== null) {
      accumulatedText += text;

      // Check if we should start buffering
      if (!buffering && looksLikeShiftStarting(accumulatedText)) {
        buffering = true;
      }

      if (buffering) {
        pendingTextEvents.push(event);
        return;
      }
    }

    // Non-text event (content_block_stop, message_delta, tool_use, etc.)
    // During buffering, only hold back text — non-text events pass through
    // immediately so tool_use blocks aren't delayed.
    if (!isTextDelta) {
      controller.enqueue(encoder.encode(event + '\n\n'));
      return;
    }

    // If we were buffering and hit a non-text event that resolves it:
    // This shouldn't happen since we only reset buffering at flush.
    // Pass through normally.
    controller.enqueue(encoder.encode(event + '\n\n'));
  }

  // Pipe upstream through the transform
  return upstreamBody.pipeThrough(transform);
}

function parseSSEEvent(event: string): {
  eventType: string;
  dataStr: string;
  isTextDelta: boolean;
  text: string | null;
} {
  const lines = event.split('\n');
  let eventType = '';
  let dataStr = '';

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      dataStr = line.slice(6);
    }
  }

  if (eventType === 'content_block_delta' && dataStr) {
    try {
      const data = JSON.parse(dataStr);
      if (data.delta?.type === 'text_delta' && typeof data.delta.text === 'string') {
        return { eventType, dataStr, isTextDelta: true, text: data.delta.text };
      }
    } catch {
      // Parse error — treat as non-text
    }
  }

  return { eventType, dataStr, isTextDelta: false, text: null };
}

/**
 * Detect if the accumulated text is starting to form a SHIFT block.
 * SHIFT blocks look like: "...\n\n---\n\nSHIFT: {...}" or "...\nSHIFT: {...}"
 * We trigger when we see "---" near the tail (within last 30 chars) or "SHIFT" appearing.
 */
function looksLikeShiftStarting(text: string): boolean {
  const tail = text.slice(-30);
  return /---\s*$/.test(tail) || /SHIFT/.test(tail);
}

/**
 * Find where the SHIFT block starts in the accumulated text.
 * Returns the index, or -1 if no SHIFT block found.
 */
function findShiftBlockStart(text: string): number {
  const dashShift = text.search(/\n---[\s\n]*SHIFT:\s*\{/);
  if (dashShift >= 0) return dashShift;

  const bareShift = text.search(/\nSHIFT:\s*\{/);
  if (bareShift >= 0) return bareShift;

  return -1;
}

/**
 * Strip SHIFT data from a non-streaming Anthropic response.
 * Returns the cleaned response JSON and any parsed emotion shift.
 */
export function stripShiftFromResponse(responseBody: Record<string, unknown>): {
  cleanedBody: Record<string, unknown>;
  emotionShift?: Partial<SelfState>;
} {
  const content = responseBody.content as Array<{ type: string; text?: string }>;
  if (!content || !Array.isArray(content)) {
    return { cleanedBody: responseBody };
  }

  let emotionShift: Partial<SelfState> | undefined;
  const cleanedContent = content.map(block => {
    if (block.type === 'text' && block.text) {
      const { cleanText, emotionShift: shift } = parseShiftFromText('\n' + block.text);
      if (shift) emotionShift = shift;

      // Also strip the "---" separator line before SHIFT
      let cleaned = cleanText;
      cleaned = cleaned.replace(/\n---\s*$/, '').trim();

      return { ...block, text: cleaned };
    }
    return block;
  });

  return {
    cleanedBody: { ...responseBody, content: cleanedContent },
    emotionShift,
  };
}
