import { enrichWithCognition } from '@/lib/cognitive-middleware';
import { createShiftFilteringStream, stripShiftFromResponse } from '@/lib/anthropic-proxy';
import { updateCognitiveState } from '@/lib/cognitive/state-updater';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Anthropic-compatible /v1/messages endpoint.
 *
 * OpenClaw's `streamSimple` POSTs here with the standard Anthropic wire format.
 * We authenticate via `x-api-key` (shared secret, not Clerk), enrich the system
 * prompt with Wybe's cognitive context, then proxy to the real Anthropic API.
 *
 * The response SSE stream passes through a TransformStream that strips
 * SHIFT lines (Wybe's internal emotion shift protocol) before they reach OpenClaw.
 *
 * Flow:
 *   OpenClaw → POST /api/v1/messages → enrichWithCognition() → Anthropic API → SHIFT filter → OpenClaw
 */
export async function POST(request: Request): Promise<Response> {
  // 1. Authenticate via shared secret
  const apiKey = request.headers.get('x-api-key');
  const gatewayKey = process.env.WYBE_GATEWAY_API_KEY;

  if (!gatewayKey || apiKey !== gatewayKey) {
    return new Response(
      JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'Invalid API key' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 2. Map to Wybe user ID
  const userId = process.env.WYBE_GATEWAY_USER_ID;
  if (!userId) {
    return new Response(
      JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Gateway user not configured' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 3. Parse the standard Anthropic request body
  let body: AnthropicRequest;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Invalid JSON' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 4. Extract the last user message for cognitive processing
  const lastUserMessage = extractLastUserMessage(body.messages);

  // 5. Enrich with cognitive context
  let enrichedSystem: string;
  let selfState;
  try {
    const result = await enrichWithCognition({
      userId,
      userMessage: lastUserMessage,
      existingSystemPrompt: normalizeSystemPrompt(body.system),
    });
    enrichedSystem = result.enrichedSystemPrompt;
    selfState = result.selfState;
  } catch (err) {
    // If cognitive enrichment fails, fall back to original system prompt
    console.error('[wybe-gateway] Cognitive enrichment failed, using passthrough:', err);
    enrichedSystem = normalizeSystemPrompt(body.system) ?? '';
    selfState = { valence: 0.6, arousal: 0.3, confidence: 0.5, energy: 0.7, social: 0.4, curiosity: 0.6 };
  }

  // 6. Build the proxied request to Anthropic
  // Map virtual Wybe model IDs to real Claude model IDs
  const MODEL_MAP: Record<string, string> = {
    'wybe-sonnet': 'claude-sonnet-4-20250514',
    'wybe-opus': 'claude-opus-4-20250514',
    'wybe-haiku': 'claude-haiku-4-5-20251001',
  };
  const resolvedModel = MODEL_MAP[body.model] ?? body.model;

  const anthropicBody = {
    ...body,
    model: resolvedModel,
    system: enrichedSystem,
  };

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    return new Response(
      JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Anthropic API key not configured' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 7. Proxy to real Anthropic API
  const anthropicVersion = request.headers.get('anthropic-version') ?? '2023-06-01';

  const anthropicBeta = request.headers.get('anthropic-beta');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': anthropicApiKey,
    'anthropic-version': anthropicVersion,
  };
  if (anthropicBeta) {
    headers['anthropic-beta'] = anthropicBeta;
  }

  const upstreamResponse = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(anthropicBody),
  });

  // If upstream returned an error, pass it through
  if (!upstreamResponse.ok) {
    const errorBody = await upstreamResponse.text();
    return new Response(errorBody, {
      status: upstreamResponse.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 8. Handle streaming vs non-streaming
  if (body.stream) {
    // Streaming: pipe through SHIFT filter
    const filteredStream = createShiftFilteringStream(upstreamResponse, userId, selfState);

    return new Response(filteredStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } else {
    // Non-streaming: strip SHIFT from response JSON
    const responseJson = await upstreamResponse.json();
    const { cleanedBody, emotionShift } = stripShiftFromResponse(responseJson);

    // Fire-and-forget state update
    if (emotionShift) {
      updateCognitiveState(userId, selfState, emotionShift).catch(() => {});
    }

    return new Response(JSON.stringify(cleanedBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ── Helpers ──

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
}

interface AnthropicRequest {
  model: string;
  system?: string | Array<{ type: string; text: string }>;
  messages: AnthropicMessage[];
  tools?: unknown[];
  max_tokens: number;
  stream?: boolean;
  [key: string]: unknown;
}

/**
 * Extract the text of the last user message for cognitive analysis.
 */
function extractLastUserMessage(messages: AnthropicMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      const content = messages[i].content;
      if (typeof content === 'string') return content;
      // Array content — extract text blocks
      if (Array.isArray(content)) {
        return content
          .filter(b => b.type === 'text' && b.text)
          .map(b => b.text!)
          .join(' ');
      }
    }
  }
  return '';
}

/**
 * Normalize the Anthropic system prompt field to a plain string.
 * It can be either a string or an array of content blocks.
 */
function normalizeSystemPrompt(
  system: string | Array<{ type: string; text: string }> | undefined,
): string | undefined {
  if (!system) return undefined;
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) {
    return system
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');
  }
  return undefined;
}
