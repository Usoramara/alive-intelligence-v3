'use client';

import { useEffect, useRef, useState } from 'react';
import type { StreamEvent } from '@/hooks/use-openclaw-stream';

const EVENT_COLORS: Record<string, string> = {
  'message.received': 'bg-blue-500/20 text-blue-400/80',
  'agent.complete': 'bg-emerald-500/20 text-emerald-400/80',
  'session.start': 'bg-purple-500/20 text-purple-400/80',
  'session.end': 'bg-purple-500/20 text-purple-400/60',
  'channel.connected': 'bg-emerald-500/20 text-emerald-400/70',
  'channel.disconnected': 'bg-red-500/20 text-red-400/70',
  'tool.call': 'bg-amber-500/20 text-amber-400/80',
  'tool.result': 'bg-amber-500/20 text-amber-400/60',
  'cron.fired': 'bg-cyan-500/20 text-cyan-400/70',
  'node.connected': 'bg-teal-500/20 text-teal-400/70',
  'node.disconnected': 'bg-red-500/20 text-red-400/60',
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatPayload(payload: unknown): string {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload;
  try {
    const str = JSON.stringify(payload);
    return str.length > 120 ? str.slice(0, 120) + '\u2026' : str;
  } catch {
    return String(payload);
  }
}

export function EventFeed({ events }: { events: StreamEvent[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const wasAtBottomRef = useRef(true);

  // Auto-scroll when not paused
  useEffect(() => {
    if (paused || !containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [events, paused]);

  const handleMouseEnter = () => setPaused(true);
  const handleMouseLeave = () => {
    setPaused(false);
    wasAtBottomRef.current = true;
  };

  return (
    <div className="bg-white/5 rounded-lg px-4 py-3 border border-white/10">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] uppercase tracking-widest text-white/30">
          Event Feed
        </h3>
        <div className="flex items-center gap-2">
          {paused && (
            <span className="text-[10px] text-amber-400/50">paused</span>
          )}
          <span className="text-[10px] text-white/20">{events.length} events</span>
        </div>
      </div>

      <div
        ref={containerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="max-h-60 overflow-y-auto scrollbar-thin flex flex-col gap-0.5"
      >
        {events.length === 0 ? (
          <div className="text-xs text-white/20 py-4 text-center">
            Waiting for events...
          </div>
        ) : (
          events.map((evt) => {
            const colorClass = EVENT_COLORS[evt.type] ?? 'bg-white/10 text-white/50';
            return (
              <div key={evt.id} className="flex items-start gap-2 py-0.5">
                <span className="text-[10px] text-white/20 shrink-0 tabular-nums w-16">
                  {formatTimestamp(evt.timestamp)}
                </span>
                <span className={`text-[10px] px-1.5 py-0 rounded shrink-0 ${colorClass}`}>
                  {evt.type}
                </span>
                <span className="text-[10px] text-white/30 truncate min-w-0">
                  {formatPayload(evt.payload)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
