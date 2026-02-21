'use client';

import { useState } from 'react';
import type { SessionInfo } from '@/hooks/use-openclaw-stream';

export function SessionsPanel({ sessions }: { sessions: SessionInfo[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="bg-white/5 rounded-lg px-4 py-3 border border-white/10">
      <h3 className="text-[10px] uppercase tracking-widest text-white/30 mb-2">
        Sessions
      </h3>

      <div className="text-sm text-white/70 mb-2">
        {sessions.length} session{sessions.length !== 1 ? 's' : ''}
      </div>

      {sessions.length === 0 ? (
        <div className="text-xs text-white/25">No active sessions</div>
      ) : (
        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto scrollbar-thin">
          {sessions.map((s, i) => {
            const id = String(s.id ?? s.name ?? `session-${i}`);
            const isExpanded = expandedId === id;

            return (
              <div key={id}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : id)}
                  className="w-full text-left flex items-center gap-2 py-1 hover:bg-white/5 rounded px-1 transition-colors"
                >
                  <span className="text-[10px] text-white/20">
                    {isExpanded ? '\u25BC' : '\u25B6'}
                  </span>
                  <span className="text-xs text-white/50 truncate flex-1">
                    {id}
                  </span>
                  {s.channel && (
                    <span className="text-[10px] text-white/20">{String(s.channel)}</span>
                  )}
                  {s.created_at != null && (
                    <span className="text-[10px] text-white/20">
                      {formatTime(String(s.created_at))}
                    </span>
                  )}
                </button>

                {isExpanded && (
                  <div className="ml-4 pl-2 border-l border-white/5 py-1 flex flex-col gap-0.5">
                    {Object.entries(s)
                      .filter(([k]) => k !== 'id' && k !== 'name')
                      .map(([key, val]) => (
                        <div key={key} className="text-[10px]">
                          <span className="text-white/30">{key}: </span>
                          <span className="text-white/50">
                            {typeof val === 'object' ? JSON.stringify(val) : String(val ?? '\u2014')}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatTime(value: string): string {
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return value;
  }
}
