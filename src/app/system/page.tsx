'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface SystemStatus {
  identity: { name: string | null; creature: string | null; vibe: string | null; emoji: string | null } | null;
  tools: {
    search: Record<string, boolean>;
    voice: Record<string, boolean>;
    codeExec: Record<string, boolean>;
    web: Record<string, boolean>;
    email: Record<string, boolean>;
    imageGen: Record<string, boolean>;
  };
  channels: Record<string, boolean>;
  body: { adapter: string | null; manifest: unknown; activeTasks: number };
  engines: { total: number; byZone: Record<string, number>; signalPaths: number };
  security: Record<string, boolean>;
  database: { connected: boolean };
}

function Dot({ on }: { on: boolean }) {
  return (
    <span className={on ? 'text-emerald-400' : 'text-white/20'}>
      {on ? '●' : '○'}
    </span>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/5 rounded-lg px-4 py-3 border border-white/10">
      <h3 className="text-[10px] uppercase tracking-widest text-white/30 mb-2">{title}</h3>
      {children}
    </div>
  );
}

function ToolRow({ label, items }: { label: string; items: Record<string, boolean> }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-white/40 w-14 shrink-0">{label}</span>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {Object.entries(items).map(([name, on]) => (
          <span key={name} className="flex items-center gap-1">
            <Dot on={on} />
            <span className={on ? 'text-white/70' : 'text-white/25'}>{name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function SystemPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchStatus() {
      try {
        const res = await fetch('/api/system/status');
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
            System Status
          </h1>
        </div>
        <div className="flex gap-4">
          <Link href="/openclaw" className="text-xs font-mono text-white/25 hover:text-white/50 transition-colors">
            OpenClaw →
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

      {status && (
        <div className="flex flex-col gap-4">
          {/* Row 1: Identity, Gateway, Database, Security */}
          <div className="grid grid-cols-4 gap-4">
            <Card title="Identity">
              {status.identity ? (
                <div className="text-sm">
                  <div className="text-white/80">
                    {status.identity.emoji && <span className="mr-1">{status.identity.emoji}</span>}
                    {status.identity.name ?? 'Unknown'}
                  </div>
                  {status.identity.creature && (
                    <div className="text-[10px] text-white/30 mt-1">{status.identity.creature}</div>
                  )}
                  {status.identity.vibe && (
                    <div className="text-[10px] text-white/30">{status.identity.vibe}</div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-white/25">No identity file</div>
              )}
            </Card>

            <Card title="Gateway">
              <div className="text-sm">
                <span className="text-emerald-400">●</span>
                <span className="text-white/70 ml-1.5">Online</span>
              </div>
              <div className="text-[10px] text-white/30 mt-1">Port 3000</div>
            </Card>

            <Card title="Database">
              <div className="text-sm">
                <Dot on={status.database.connected} />
                <span className={`ml-1.5 ${status.database.connected ? 'text-white/70' : 'text-white/30'}`}>
                  {status.database.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </Card>

            <Card title="Security">
              <div className="flex flex-col gap-1 text-xs">
                <span><Dot on={status.security.encryption} /> <span className="text-white/50">Encryption</span></span>
                <span><Dot on={status.security.cronSecret} /> <span className="text-white/50">Cron</span></span>
                <span><Dot on={status.security.clerkAuth} /> <span className="text-white/50">Auth</span></span>
              </div>
            </Card>
          </div>

          {/* Row 2: Tools */}
          <Card title="Tools">
            <div className="flex flex-col gap-2">
              <ToolRow label="Search" items={status.tools.search} />
              <ToolRow label="Voice" items={status.tools.voice} />
              <ToolRow label="Code" items={status.tools.codeExec} />
              <ToolRow label="Web" items={status.tools.web} />
              <ToolRow label="Email" items={status.tools.email} />
              <ToolRow label="Images" items={status.tools.imageGen} />
            </div>
          </Card>

          {/* Row 3: Channels + Body HAL */}
          <div className="grid grid-cols-2 gap-4">
            <Card title="Channels">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(status.channels).map(([name, on]) => (
                  <span key={name} className="flex items-center gap-1.5">
                    <Dot on={on} />
                    <span className={on ? 'text-white/70' : 'text-white/25'}>
                      {name.charAt(0).toUpperCase() + name.slice(1)}
                    </span>
                  </span>
                ))}
              </div>
            </Card>

            <Card title="Body HAL">
              <div className="text-xs">
                <div className="text-white/50">
                  Adapter: <span className="text-white/70">{status.body.adapter ?? 'none'}</span>
                </div>
                <div className="text-white/50 mt-1">
                  Tasks: <span className="text-white/70">{status.body.activeTasks} active</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Row 4: Cognitive Engines */}
          <Card title="Cognitive Engines">
            <div className="text-sm text-white/70">
              {status.engines.total} engines · {status.engines.signalPaths} signal paths
            </div>
            <div className="flex gap-4 mt-2 text-xs text-white/40">
              <span>
                <span className="text-blue-400">●</span> Outer({status.engines.byZone.outer})
              </span>
              <span>
                <span className="text-purple-400">●</span> Inner({status.engines.byZone.inner})
              </span>
              <span>
                <span className="text-amber-400">●</span> Thalamus({status.engines.byZone.thalamus})
              </span>
              <span>
                <span className="text-emerald-400">●</span> Body({status.engines.byZone.body})
              </span>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
