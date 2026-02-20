'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface OpenClawStatus {
  gatewayOnline: boolean;
  health: Record<string, unknown> | null;
  channels: Record<string, unknown> | null;
  sessions: Array<Record<string, unknown>> | null;
  error: string | null;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/5 rounded-lg px-4 py-3 border border-white/10">
      <h3 className="text-[10px] uppercase tracking-widest text-white/30 mb-2">{title}</h3>
      {children}
    </div>
  );
}

function StatusDot({ on }: { on: boolean }) {
  return (
    <span className={on ? 'text-emerald-400' : 'text-white/20'}>
      {on ? '●' : '○'}
    </span>
  );
}

function KeyValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-xs">
      <span className="text-white/40">{label}: </span>
      <span className="text-white/70">{value}</span>
    </div>
  );
}

function ObjectEntries({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-1">
      {Object.entries(data).map(([key, val]) => (
        <KeyValue key={key} label={key} value={String(val ?? '—')} />
      ))}
    </div>
  );
}

export default function OpenClawPage() {
  const [status, setStatus] = useState<OpenClawStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchStatus() {
      try {
        const res = await fetch('/api/openclaw/status');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (active) {
          setStatus(data);
          setError(null);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Failed to fetch');
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  return (
    <main className="min-h-screen w-screen p-6 max-w-5xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-xs font-mono text-white/30 hover:text-white/60 transition-colors"
          >
            ← Back
          </Link>
          <h1 className="text-lg font-mono text-white/80 tracking-tight">
            OpenClaw Gateway
          </h1>
        </div>
        <div className="flex gap-4">
          <Link href="/system" className="text-xs font-mono text-white/25 hover:text-white/50 transition-colors">
            System →
          </Link>
          <Link href="/thoughts" className="text-xs font-mono text-white/25 hover:text-white/50 transition-colors">
            Thoughts →
          </Link>
        </div>
      </header>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-4 text-xs text-red-400">
          {error}
        </div>
      )}

      {!status && !error && (
        <div className="text-xs text-white/30 font-mono">Loading...</div>
      )}

      {status && !status.gatewayOnline && (
        <Card title="Status">
          <div className="text-sm">
            <StatusDot on={false} />
            <span className="text-white/50 ml-1.5">Gateway Offline</span>
          </div>
          <p className="text-[10px] text-white/25 mt-2">
            {status.error ?? 'Gateway not running'}
          </p>
          <p className="text-[10px] text-white/30 mt-2 font-mono bg-white/5 rounded px-2 py-1 inline-block">
            $ openclaw gateway
          </p>
        </Card>
      )}

      {status && status.gatewayOnline && (
        <div className="flex flex-col gap-4">
          {/* Row 1: Status + Agent */}
          <div className="grid grid-cols-2 gap-4">
            <Card title="Status">
              <div className="text-sm mb-2">
                <StatusDot on={true} />
                <span className="text-white/70 ml-1.5">Online</span>
              </div>
              {status.health && typeof status.health === 'object' && (
                <ObjectEntries
                  data={Object.fromEntries(
                    Object.entries(status.health).filter(
                      ([k]) => !['channels', 'agent', 'skills', 'sessions'].includes(k)
                    )
                  )}
                />
              )}
            </Card>

            <Card title="Agent">
              {status.health && typeof status.health === 'object' && status.health.agent ? (
                <ObjectEntries data={status.health.agent as Record<string, unknown>} />
              ) : (
                <div className="text-xs text-white/25">No agent info</div>
              )}
            </Card>
          </div>

          {/* Row 2: Channels */}
          <Card title="Channels">
            {status.channels && typeof status.channels === 'object' ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                {(() => {
                  // channels may be an object with a 'channels' key, or a flat list
                  const channelData =
                    Array.isArray(status.channels)
                      ? status.channels
                      : Array.isArray((status.channels as Record<string, unknown>).channels)
                        ? (status.channels as Record<string, unknown>).channels as Array<Record<string, unknown>>
                        : Object.entries(status.channels).map(([name, val]) => ({
                            name,
                            ...(typeof val === 'object' && val ? val as Record<string, unknown> : { status: String(val) }),
                          }));

                  return (channelData as Array<Record<string, unknown>>).map((ch, i) => {
                    const name = String(ch.name ?? ch.type ?? `Channel ${i + 1}`);
                    const connected =
                      ch.status === 'connected' || ch.connected === true || ch.online === true;
                    return (
                      <span key={i} className="flex items-center gap-1.5">
                        <StatusDot on={connected} />
                        <span className={connected ? 'text-white/70' : 'text-white/25'}>
                          {name}
                        </span>
                        {ch.status != null && (
                          <span className="text-white/20 text-[10px]">({String(ch.status)})</span>
                        )}
                      </span>
                    );
                  });
                })()}
              </div>
            ) : (
              <div className="text-xs text-white/25">No channel data</div>
            )}
          </Card>

          {/* Row 3: Sessions + Skills */}
          <div className="grid grid-cols-2 gap-4">
            <Card title="Sessions">
              {status.sessions && Array.isArray(status.sessions) ? (
                <>
                  <div className="text-sm text-white/70 mb-2">
                    {status.sessions.length} session{status.sessions.length !== 1 ? 's' : ''}
                  </div>
                  <div className="flex flex-col gap-1 max-h-40 overflow-y-auto scrollbar-thin">
                    {status.sessions.slice(0, 10).map((s, i) => (
                      <div key={i} className="text-[10px] text-white/40 truncate">
                        {String(s.id ?? s.name ?? `Session ${i + 1}`)}
                        {s.created_at != null && (
                          <span className="text-white/20 ml-2">{String(s.created_at)}</span>
                        )}
                      </div>
                    ))}
                    {status.sessions.length > 10 && (
                      <div className="text-[10px] text-white/20">
                        +{status.sessions.length - 10} more
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-xs text-white/25">No sessions</div>
              )}
            </Card>

            <Card title="Skills">
              {status.health &&
              typeof status.health === 'object' &&
              Array.isArray((status.health as Record<string, unknown>).skills) ? (
                <div className="flex flex-wrap gap-2">
                  {((status.health as Record<string, unknown>).skills as Array<unknown>).map(
                    (skill, i) => (
                      <span
                        key={i}
                        className="text-[10px] bg-white/5 border border-white/10 rounded px-2 py-0.5 text-white/50"
                      >
                        {typeof skill === 'string' ? skill : String((skill as Record<string, unknown>).name ?? skill)}
                      </span>
                    ),
                  )}
                </div>
              ) : (
                <div className="text-xs text-white/25">No skills data</div>
              )}
            </Card>
          </div>
        </div>
      )}
    </main>
  );
}
