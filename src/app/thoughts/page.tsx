'use client';

import Link from 'next/link';
import { MindProvider } from '@/components/mind-provider';
import { SignalWaterfall } from '@/components/panels/signal-waterfall';
import { ThoughtTrace } from '@/components/panels/thought-trace';
import { SelfStateTimeline } from '@/components/panels/self-state-timeline';
import { StreamPanel } from '@/components/panels/stream-panel';
import { EngineStatusSummary } from './engine-status-summary';

export default function ThoughtsPage() {
  return (
    <MindProvider>
      <main className="h-screen w-screen flex flex-col p-4 gap-3">
        {/* Header */}
        <header className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-xs font-mono text-white/30 hover:text-white/60 transition-colors"
            >
              ← Back
            </Link>
            <h1 className="text-lg font-mono text-white/80 tracking-tight">
              Thought Processing
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/system" className="text-xs font-mono text-white/30 hover:text-white/60 transition-colors">
              System →
            </Link>
            <Link href="/openclaw" className="text-xs font-mono text-white/30 hover:text-white/60 transition-colors">
              OpenClaw →
            </Link>
            <SelfStateTimeline />
          </div>
        </header>

        {/* Main content — 60/40 split */}
        <div className="flex-1 flex gap-3 min-h-0">
          {/* Signal Waterfall — 60% */}
          <div className="w-[60%] min-h-0">
            <SignalWaterfall />
          </div>

          {/* Thought Trace — 40% */}
          <div className="w-[40%] min-h-0">
            <ThoughtTrace />
          </div>
        </div>

        {/* Bottom strip */}
        <div className="shrink-0 flex gap-3">
          <div className="flex-1">
            <StreamPanel />
          </div>
          <EngineStatusSummary />
        </div>
      </main>
    </MindProvider>
  );
}
