import { createSSEStream } from '@/lib/sse';
import { getOpenClawBridge } from '@/lib/openclaw-bridge';
import { callOpenClaw } from '@/lib/openclaw-rpc';

const BRIDGE_EVENTS = [
  'message.received',
  'agent.complete',
  'session.start',
  'session.end',
  'channel.connected',
  'channel.disconnected',
  'tool.call',
  'tool.result',
  'cron.fired',
  'node.connected',
  'node.disconnected',
] as const;

export async function GET() {
  const { stream, send, close } = createSSEStream();

  const bridge = getOpenClawBridge();

  // --- Bridge event handlers ---
  const handlers = BRIDGE_EVENTS.map((event) => {
    const handler = (payload: unknown) => {
      send('event', { type: event, payload, timestamp: Date.now() });
    };
    bridge.on(event, handler);
    return { event, handler };
  });

  // --- Poll bridge status every 5s ---
  const bridgePollInterval = setInterval(() => {
    const status = bridge.getStatus();
    send('gateway-status', {
      bridge: status,
      timestamp: Date.now(),
    });
  }, 5_000);

  // --- Poll health + channels every 10s ---
  const healthPollInterval = setInterval(async () => {
    const [healthResult, channelsResult] = await Promise.all([
      callOpenClaw('health'),
      callOpenClaw('channels.status'),
    ]);

    send('gateway-status', {
      bridge: bridge.getStatus(),
      health: healthResult.ok ? healthResult.data : null,
      timestamp: Date.now(),
    });

    send('channel-update', {
      channels: channelsResult.ok ? channelsResult.data : null,
      timestamp: Date.now(),
    });
  }, 10_000);

  // --- Keepalive every 30s ---
  const keepaliveInterval = setInterval(() => {
    send('keepalive', { timestamp: Date.now() });
  }, 30_000);

  // --- Send initial state immediately ---
  const bridgeStatus = bridge.getStatus();
  send('gateway-status', {
    bridge: bridgeStatus,
    timestamp: Date.now(),
  });

  // Fetch initial health + channels
  Promise.all([
    callOpenClaw('health'),
    callOpenClaw('channels.status'),
    callOpenClaw('sessions.list'),
  ]).then(([healthResult, channelsResult, sessionsResult]) => {
    if (healthResult.ok) {
      send('gateway-status', {
        bridge: bridge.getStatus(),
        health: healthResult.data,
        timestamp: Date.now(),
      });
    }
    if (channelsResult.ok) {
      send('channel-update', {
        channels: channelsResult.data,
        timestamp: Date.now(),
      });
    }
    if (sessionsResult.ok) {
      const raw = sessionsResult.data as Record<string, unknown>;
      const sessions = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.sessions)
          ? raw.sessions
          : [];
      send('sessions-update', { sessions, timestamp: Date.now() });
    }
  });

  // --- Pipe stream with cleanup on disconnect ---
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
      // Cleanup
      clearInterval(bridgePollInterval);
      clearInterval(healthPollInterval);
      clearInterval(keepaliveInterval);
      for (const { event, handler } of handlers) {
        bridge.off(event, handler);
      }
      close();
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
