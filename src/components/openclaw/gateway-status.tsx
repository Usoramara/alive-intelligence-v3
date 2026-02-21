'use client';

import type { GatewayInfo } from '@/hooks/use-openclaw-stream';

function StatusDot({ on }: { on: boolean }) {
  return (
    <span className={on ? 'text-emerald-400' : 'text-white/20'}>
      {on ? '\u25CF' : '\u25CB'}
    </span>
  );
}

export function GatewayStatus({
  connected,
  gateway,
}: {
  connected: boolean;
  gateway: GatewayInfo;
}) {
  const bridgeConnected = gateway.bridge?.connected ?? false;
  const latency = gateway.bridge?.latencyMs;
  const health = gateway.health;

  // Extract agent info from health data
  const agent = health && typeof health === 'object'
    ? (health as Record<string, unknown>).agent as Record<string, unknown> | undefined
    : undefined;

  // Filter out nested objects from health for the summary display
  const healthSummary = health && typeof health === 'object'
    ? Object.fromEntries(
        Object.entries(health as Record<string, unknown>).filter(
          ([k]) => !['channels', 'agent', 'skills', 'sessions'].includes(k)
        )
      )
    : null;

  return (
    <div className="bg-white/5 rounded-lg px-4 py-3 border border-white/10">
      <h3 className="text-[10px] uppercase tracking-widest text-white/30 mb-2">
        Gateway Status
      </h3>

      {/* Connection indicator */}
      <div className="flex items-center gap-2 mb-3">
        <StatusDot on={bridgeConnected} />
        <span className="text-sm text-white/70">
          {bridgeConnected ? 'Online' : 'Offline'}
        </span>
        {!connected && (
          <span className="text-[10px] text-amber-400/60 ml-auto">SSE disconnected</span>
        )}
      </div>

      {/* Latency */}
      {latency != null && (
        <div className="text-xs mb-1">
          <span className="text-white/40">Latency: </span>
          <span className="text-white/70">{latency}ms</span>
        </div>
      )}

      {/* Health summary */}
      {healthSummary && Object.keys(healthSummary).length > 0 && (
        <div className="flex flex-col gap-0.5 mt-2">
          {Object.entries(healthSummary).map(([key, val]) => (
            <div key={key} className="text-xs">
              <span className="text-white/40">{key}: </span>
              <span className="text-white/70">{String(val ?? '\u2014')}</span>
            </div>
          ))}
        </div>
      )}

      {/* Agent info */}
      {agent && (
        <div className="mt-3 pt-2 border-t border-white/5">
          <div className="text-[10px] uppercase tracking-widest text-white/25 mb-1">Agent</div>
          {Object.entries(agent).map(([key, val]) => (
            <div key={key} className="text-xs">
              <span className="text-white/40">{key}: </span>
              <span className="text-white/70">{String(val ?? '\u2014')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
