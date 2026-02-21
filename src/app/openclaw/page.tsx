'use client';

import Link from 'next/link';
import { useOpenClawStream } from '@/hooks/use-openclaw-stream';
import { GatewayStatus } from '@/components/openclaw/gateway-status';
import { ChannelsPanel } from '@/components/openclaw/channels-panel';
import { SessionsPanel } from '@/components/openclaw/sessions-panel';
import { SkillsPanel } from '@/components/openclaw/skills-panel';
import { SchedulesPanel } from '@/components/openclaw/schedules-panel';
import { DevicesPanel } from '@/components/openclaw/devices-panel';
import { EventFeed } from '@/components/openclaw/event-feed';

export default function OpenClawPage() {
  const { connected, gateway, channels, sessions, events } = useOpenClawStream();

  const isOnline = gateway.bridge?.connected ?? false;

  return (
    <main className="min-h-screen w-screen p-6 max-w-5xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-xs font-mono text-white/30 hover:text-white/60 transition-colors"
          >
            &larr; Back
          </Link>
          <h1 className="text-lg font-mono text-white/80 tracking-tight">
            OpenClaw Gateway
          </h1>
          {connected && (
            <span className="text-[10px] text-emerald-400/50">live</span>
          )}
        </div>
        <div className="flex gap-4">
          <Link href="/system" className="text-xs font-mono text-white/25 hover:text-white/50 transition-colors">
            System &rarr;
          </Link>
          <Link href="/thoughts" className="text-xs font-mono text-white/25 hover:text-white/50 transition-colors">
            Thoughts &rarr;
          </Link>
        </div>
      </header>

      {/* Offline state */}
      {!isOnline && !connected && (
        <div className="bg-white/5 rounded-lg px-4 py-3 border border-white/10 mb-4">
          <div className="text-sm">
            <span className="text-white/20">{'\u25CB'}</span>
            <span className="text-white/50 ml-1.5">Gateway Offline</span>
          </div>
          <p className="text-[10px] text-white/25 mt-2">
            Gateway not running or bridge disconnected
          </p>
          <p className="text-[10px] text-white/30 mt-2 font-mono bg-white/5 rounded px-2 py-1 inline-block">
            $ openclaw gateway
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {/* Row 1: Gateway Status + Channels */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <GatewayStatus connected={connected} gateway={gateway} />
          <div className="md:col-span-2">
            <ChannelsPanel channels={channels} />
          </div>
        </div>

        {/* Row 2: Sessions + Skills */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SessionsPanel sessions={sessions} />
          <SkillsPanel gateway={gateway} />
        </div>

        {/* Row 3: Schedules */}
        <SchedulesPanel />

        {/* Row 4: Devices */}
        <DevicesPanel />

        {/* Row 5: Event Feed */}
        <EventFeed events={events} />
      </div>
    </main>
  );
}
