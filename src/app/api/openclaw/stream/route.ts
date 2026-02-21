import { createSSEStream } from '@/lib/sse';
import { getOpenClawBridge } from '@/lib/openclaw-bridge';
import { callOpenClaw } from '@/lib/openclaw-rpc';
import { getEngineSnapshots, getRecentSignalActivity } from '@/core/engine-status';
import { getDb } from '@/db';
import { cognitiveStates } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { SelfState } from '@/core/types';

const DEFAULT_USER_ID = process.env.WYBE_GATEWAY_USER_ID || 'wybe-gateway';

const DEFAULT_STATE: SelfState = {
  valence: 0.6, arousal: 0.3, confidence: 0.5,
  energy: 0.7, social: 0.4, curiosity: 0.6,
};

function stateToDescription(s: SelfState): string {
  const parts: string[] = [];
  if (s.valence > 0.3) parts.push('feeling positive');
  else if (s.valence < -0.3) parts.push('feeling negative');
  else parts.push('emotionally neutral');
  if (s.arousal > 0.6) parts.push('highly alert');
  else if (s.arousal < 0.2) parts.push('very calm');
  if (s.confidence > 0.7) parts.push('confident');
  if (s.energy > 0.7) parts.push('energetic');
  if (s.curiosity > 0.7) parts.push('very curious');
  return parts.join(', ');
}

async function fetchCognitiveState() {
  try {
    const db = getDb();
    const result = await db.select().from(cognitiveStates).where(eq(cognitiveStates.userId, DEFAULT_USER_ID));
    const selfState: SelfState = result[0]
      ? { valence: result[0].valence, arousal: result[0].arousal, confidence: result[0].confidence,
          energy: result[0].energy, social: result[0].social, curiosity: result[0].curiosity }
      : { ...DEFAULT_STATE };
    return {
      selfState,
      stateDescription: stateToDescription(selfState),
      engineStatuses: getEngineSnapshots(selfState),
      recentSignals: getRecentSignalActivity(),
      tick: Math.floor(Date.now() / 1000),
    };
  } catch {
    return {
      selfState: { ...DEFAULT_STATE },
      stateDescription: stateToDescription(DEFAULT_STATE),
      engineStatuses: [],
      recentSignals: [],
      tick: 0,
    };
  }
}

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

  // --- Poll cognitive state every 5s ---
  const cognitionPollInterval = setInterval(async () => {
    const cognition = await fetchCognitiveState();
    send('cognitive-state', { ...cognition, timestamp: Date.now() });
  }, 5_000);

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

  // Fetch initial cognitive state
  fetchCognitiveState().then((cognition) => {
    send('cognitive-state', { ...cognition, timestamp: Date.now() });
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
      clearInterval(cognitionPollInterval);
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
