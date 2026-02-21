import { NextResponse } from 'next/server';
import { createSSEStream } from '@/lib/sse';
import { getOpenClawBridge } from '@/lib/openclaw-bridge';
import { callOpenClaw } from '@/lib/openclaw-rpc';
import { validateOpenClawAuth } from '@/lib/openclaw-auth';

const STREAM_TIMEOUT_MS = 120_000;

export async function POST(request: Request) {
  const auth = validateOpenClawAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { sessionKey, message, thinking, deliver, attachments } = body;
  if (!sessionKey || !message) {
    return NextResponse.json({ error: 'sessionKey and message are required' }, { status: 400 });
  }

  const idempotencyKey = (body.idempotencyKey as string) || crypto.randomUUID();

  const { stream, send, close } = createSSEStream();
  const bridge = getOpenClawBridge();

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    bridge.off('chat', chatHandler);
    clearTimeout(safetyTimer);
    close();
  };

  // Listen for chat events filtered by sessionKey
  const chatHandler = (payload: unknown) => {
    const event = payload as Record<string, unknown>;
    if (event.sessionKey !== sessionKey) return;

    send('chat', payload);

    const state = event.state as string | undefined;
    if (state === 'final' || state === 'error' || state === 'aborted') {
      cleanup();
    }
  };

  bridge.on('chat', chatHandler);

  // Safety timeout to prevent zombie streams
  const safetyTimer = setTimeout(() => {
    send('chat', { state: 'error', error: 'Stream timeout', sessionKey });
    cleanup();
  }, STREAM_TIMEOUT_MS);

  // Fire-and-forget the RPC call — we stream events, not the RPC response
  const rpcParams: Record<string, unknown> = {
    sessionKey,
    message,
    idempotencyKey,
    ...(thinking !== undefined && { thinking }),
    ...(deliver !== undefined && { deliver }),
    ...(attachments !== undefined && { attachments }),
  };

  callOpenClaw('chat.send', rpcParams, STREAM_TIMEOUT_MS).then((result) => {
    if (!result.ok && !cleaned) {
      send('chat', { state: 'error', error: result.error.message, sessionKey });
      cleanup();
    }
  });

  // Pipe stream with cleanup on client disconnect
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const reader = stream.getReader();

  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
      await writer.close();
    } catch {
      // Client disconnected
    } finally {
      cleanup();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
