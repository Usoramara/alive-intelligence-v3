'use client';

import { useEffect, useRef, useState } from 'react';
import { useMind } from '@/hooks/use-mind';
import { ENGINE_NAMES, ZONE_COLORS, ENGINE_ZONES, type Zone } from '@/core/constants';
import type { Signal, SignalType } from '@/core/types';

const THOUGHT_CHAIN_TYPES: SignalType[] = [
  'text-input',
  'perception-result',
  'attention-focus',
  'bound-representation',
  'thought',
  'claude-response',
  'voice-output',
];

const ZONES: Zone[] = ['outer', 'inner', 'thalamus', 'body'];

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  const ms = d.getMilliseconds().toString().padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

function payloadSnippet(signal: Signal): string {
  const p = signal.payload as unknown;
  if (!p) return '';
  if (typeof p === 'string') return p.slice(0, 60);
  if (typeof p === 'object' && p !== null) {
    const obj = p as Record<string, unknown>;
    if ('text' in obj && typeof obj.text === 'string') return obj.text.slice(0, 60);
    if ('content' in obj && typeof obj.content === 'string') return obj.content.slice(0, 60);
    if ('description' in obj && typeof obj.description === 'string') return obj.description.slice(0, 60);
  }
  return '';
}

export function SignalWaterfall() {
  const mind = useMind();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [zoneFilters, setZoneFilters] = useState<Record<Zone, boolean>>({
    outer: true,
    inner: true,
    thalamus: true,
    body: true,
  });
  const [thoughtChainOnly, setThoughtChainOnly] = useState(false);
  const pausedSignalsRef = useRef<Signal[]>([]);

  // Freeze signal list when paused
  if (!paused) {
    pausedSignalsRef.current = mind.signalHistory;
  }
  const signals = paused ? pausedSignalsRef.current : mind.signalHistory;

  // Filter signals
  const filtered = signals.filter((signal) => {
    const zone = ENGINE_ZONES[signal.source];
    if (!zoneFilters[zone]) return false;
    if (thoughtChainOnly && !THOUGHT_CHAIN_TYPES.includes(signal.type)) return false;
    return true;
  });

  // Auto-scroll when not paused
  useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length, paused]);

  const toggleZone = (zone: Zone) => {
    setZoneFilters((prev) => ({ ...prev, [zone]: !prev[zone] }));
  };

  return (
    <div className="flex flex-col h-full bg-white/5 rounded-lg backdrop-blur-sm border border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/5">
        <h3 className="text-white/60 text-xs font-mono uppercase tracking-wider">
          Signal Waterfall
          <span className="ml-2 text-white/20">({filtered.length})</span>
        </h3>
        <div className="flex items-center gap-2">
          {/* Zone filter buttons */}
          {ZONES.map((zone) => (
            <button
              key={zone}
              onClick={() => toggleZone(zone)}
              className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded transition-all"
              style={{
                backgroundColor: zoneFilters[zone]
                  ? ZONE_COLORS[zone] + '30'
                  : 'transparent',
                color: zoneFilters[zone] ? ZONE_COLORS[zone] : 'rgba(255,255,255,0.2)',
                border: `1px solid ${zoneFilters[zone] ? ZONE_COLORS[zone] + '50' : 'rgba(255,255,255,0.1)'}`,
              }}
            >
              {zone}
            </button>
          ))}

          {/* Thought chain toggle */}
          <button
            onClick={() => setThoughtChainOnly(!thoughtChainOnly)}
            className="text-[9px] font-mono px-1.5 py-0.5 rounded transition-all"
            style={{
              backgroundColor: thoughtChainOnly ? 'rgba(255,255,255,0.15)' : 'transparent',
              color: thoughtChainOnly ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.2)',
              border: `1px solid ${thoughtChainOnly ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'}`,
            }}
          >
            chain
          </button>

          {/* Pause button */}
          <button
            onClick={() => setPaused(!paused)}
            className="text-[9px] font-mono px-1.5 py-0.5 rounded transition-all"
            style={{
              backgroundColor: paused ? 'rgba(239,68,68,0.2)' : 'transparent',
              color: paused ? '#ef4444' : 'rgba(255,255,255,0.3)',
              border: `1px solid ${paused ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
            }}
          >
            {paused ? 'paused' : 'pause'}
          </button>
        </div>
      </div>

      {/* Signal list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-px"
      >
        {filtered.length === 0 && (
          <p className="text-white/20 text-xs font-mono italic p-2">
            No signals yet...
          </p>
        )}
        {filtered.map((signal) => {
          const sourceZone = ENGINE_ZONES[signal.source];
          const sourceColor = ZONE_COLORS[sourceZone];
          const isThoughtChain = THOUGHT_CHAIN_TYPES.includes(signal.type);
          const targetName = signal.target
            ? Array.isArray(signal.target)
              ? signal.target.map((t) => ENGINE_NAMES[t]).join(', ')
              : ENGINE_NAMES[signal.target]
            : 'broadcast';
          const snippet = payloadSnippet(signal);

          return (
            <div
              key={signal.id}
              className="flex items-start gap-1.5 text-[10px] font-mono py-0.5 px-1 rounded hover:bg-white/5"
              style={{
                borderLeft: isThoughtChain
                  ? `2px solid ${sourceColor}`
                  : '2px solid transparent',
              }}
            >
              {/* Timestamp */}
              <span className="text-white/20 shrink-0 tabular-nums">
                {formatTimestamp(signal.timestamp)}
              </span>

              {/* Zone dot */}
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0 mt-0.5"
                style={{ backgroundColor: sourceColor }}
              />

              {/* Source → Target */}
              <span style={{ color: sourceColor }} className="shrink-0">
                {ENGINE_NAMES[signal.source]}
              </span>
              <span className="text-white/20 shrink-0">→</span>
              <span className="text-white/40 shrink-0">{targetName}</span>

              {/* Signal type */}
              <span className="text-white/25 shrink-0">|</span>
              <span className="text-white/50">{signal.type}</span>

              {/* Payload snippet */}
              {snippet && (
                <>
                  <span className="text-white/25 shrink-0">|</span>
                  <span className="text-white/25 truncate flex-1">{snippet}</span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
