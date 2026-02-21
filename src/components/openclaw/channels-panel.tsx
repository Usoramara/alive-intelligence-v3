'use client';

import { useState } from 'react';
import type { ChannelInfo } from '@/hooks/use-openclaw-stream';

function StatusDot({ on }: { on: boolean }) {
  return (
    <span className={on ? 'text-emerald-400' : 'text-white/20'}>
      {on ? '\u25CF' : '\u25CB'}
    </span>
  );
}

async function channelAction(action: 'start' | 'stop' | 'logout', channel: string) {
  const res = await fetch(`/api/openclaw/channels/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to ${action} channel`);
  }
  return res.json();
}

export function ChannelsPanel({ channels }: { channels: ChannelInfo[] }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (action: 'start' | 'stop' | 'logout', channel: string) => {
    setLoading(`${action}-${channel}`);
    setError(null);
    try {
      await channelAction(action, channel);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="bg-white/5 rounded-lg px-4 py-3 border border-white/10">
      <h3 className="text-[10px] uppercase tracking-widest text-white/30 mb-2">
        Channels
      </h3>

      {error && (
        <div className="text-[10px] text-red-400/80 mb-2">{error}</div>
      )}

      {channels.length === 0 ? (
        <div className="text-xs text-white/25">No channels</div>
      ) : (
        <div className="flex flex-col gap-2">
          {channels.map((ch, i) => {
            const name = String(ch.name ?? ch.type ?? `Channel ${i + 1}`);
            const isConnected =
              ch.status === 'connected' || ch.connected === true || ch.online === true;

            return (
              <div key={name} className="flex items-center gap-2">
                <StatusDot on={isConnected} />
                <span className={`text-xs flex-1 ${isConnected ? 'text-white/70' : 'text-white/30'}`}>
                  {name}
                </span>
                {ch.status != null && (
                  <span className="text-[10px] text-white/20">({String(ch.status)})</span>
                )}
                <div className="flex gap-1 ml-auto">
                  {!isConnected ? (
                    <button
                      onClick={() => handleAction('start', name)}
                      disabled={loading !== null}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400/70 hover:bg-emerald-500/20 disabled:opacity-30 transition-colors"
                    >
                      {loading === `start-${name}` ? '...' : 'Start'}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleAction('stop', name)}
                        disabled={loading !== null}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400/70 hover:bg-amber-500/20 disabled:opacity-30 transition-colors"
                      >
                        {loading === `stop-${name}` ? '...' : 'Stop'}
                      </button>
                      <button
                        onClick={() => handleAction('logout', name)}
                        disabled={loading !== null}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400/70 hover:bg-red-500/20 disabled:opacity-30 transition-colors"
                      >
                        {loading === `logout-${name}` ? '...' : 'Logout'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
