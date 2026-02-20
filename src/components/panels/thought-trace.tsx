'use client';

import { useEffect, useRef, useState } from 'react';
import { useMind } from '@/hooks/use-mind';
import { ENGINE_NAMES, ZONE_COLORS, ENGINE_ZONES } from '@/core/constants';
import type { Signal, SignalType } from '@/core/types';

// The expected order of a thought chain
const CHAIN_STEPS: SignalType[] = [
  'text-input',
  'perception-result',
  'attention-focus',
  'bound-representation',
  'thought',
  'claude-response',
  'voice-output',
];

interface TraceStep {
  signalType: SignalType;
  source: string;
  timestamp: number;
  deltaMs: number | null; // ms since previous step
}

interface ThoughtChain {
  id: string;
  steps: TraceStep[];
  totalMs: number;
  completedAt: number;
}

function buildChain(signals: Signal[], triggerSignal: Signal): ThoughtChain | null {
  const steps: TraceStep[] = [];
  const triggerTs = triggerSignal.timestamp;

  // Walk backward through chain types looking for the most recent of each
  // within a reasonable time window (10s before the trigger)
  const window = 10000;

  for (const stepType of CHAIN_STEPS) {
    // Find the most recent signal of this type before or at the trigger
    let found: Signal | undefined;
    for (let i = signals.length - 1; i >= 0; i--) {
      const s = signals[i];
      if (s.type === stepType && s.timestamp <= triggerTs && triggerTs - s.timestamp < window) {
        found = s;
        break;
      }
    }

    if (found) {
      const prevStep = steps.length > 0 ? steps[steps.length - 1] : null;
      steps.push({
        signalType: stepType,
        source: found.source,
        timestamp: found.timestamp,
        deltaMs: prevStep ? found.timestamp - prevStep.timestamp : null,
      });
    }
  }

  if (steps.length < 2) return null;

  const totalMs = steps[steps.length - 1].timestamp - steps[0].timestamp;

  return {
    id: `${triggerSignal.id}-${triggerTs}`,
    steps,
    totalMs,
    completedAt: triggerTs,
  };
}

export function ThoughtTrace() {
  const mind = useMind();
  const [chains, setChains] = useState<ThoughtChain[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const lastProcessedRef = useRef<string | null>(null);

  // Watch for new claude-response signals
  useEffect(() => {
    const history = mind.signalHistory;
    // Find the latest claude-response
    let latestResponse: Signal | undefined;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].type === 'claude-response') {
        latestResponse = history[i];
        break;
      }
    }

    if (!latestResponse || latestResponse.id === lastProcessedRef.current) return;
    lastProcessedRef.current = latestResponse.id;

    const chain = buildChain(history, latestResponse);
    if (chain) {
      setChains((prev) => {
        const next = [...prev, chain].slice(-3); // Keep last 3
        return next;
      });
      setExpandedId(chain.id);
    }
  }, [mind.signalHistory]);

  return (
    <div className="flex flex-col h-full bg-white/5 rounded-lg backdrop-blur-sm border border-white/10">
      {/* Header */}
      <div className="p-3 border-b border-white/5">
        <h3 className="text-white/60 text-xs font-mono uppercase tracking-wider">
          Thought Trace
          <span className="ml-2 text-white/20">({chains.length})</span>
        </h3>
      </div>

      {/* Traces */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
        {chains.length === 0 && (
          <p className="text-white/20 text-xs font-mono italic">
            Waiting for thought cycle...
          </p>
        )}
        {chains.map((chain) => {
          const isExpanded = expandedId === chain.id;
          return (
            <div key={chain.id}>
              {/* Chain header */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : chain.id)}
                className="w-full text-left flex items-center gap-2 text-[10px] font-mono mb-1 hover:bg-white/5 rounded px-1 py-0.5 transition-colors"
              >
                <span className="text-white/30">{isExpanded ? '▼' : '▶'}</span>
                <span className="text-white/50">
                  {chain.steps.length} steps
                </span>
                <span className="text-white/20">|</span>
                <span className="text-white/40 tabular-nums">
                  {chain.totalMs}ms total
                </span>
                <span className="text-white/15 ml-auto tabular-nums">
                  {new Date(chain.completedAt).toLocaleTimeString()}
                </span>
              </button>

              {/* Chain steps */}
              {isExpanded && (
                <div className="ml-2 space-y-0">
                  {chain.steps.map((step, i) => {
                    const zone = ENGINE_ZONES[step.source as keyof typeof ENGINE_ZONES];
                    const color = zone ? ZONE_COLORS[zone] : 'rgba(255,255,255,0.3)';
                    const name = ENGINE_NAMES[step.source as keyof typeof ENGINE_NAMES] || step.source;
                    const isLast = i === chain.steps.length - 1;

                    return (
                      <div key={`${step.signalType}-${i}`}>
                        {/* Node */}
                        <div className="flex items-center gap-2 py-1">
                          <div
                            className="w-2 h-2 rounded-sm shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <div
                            className="text-[10px] font-mono px-2 py-0.5 rounded border"
                            style={{
                              borderColor: color + '40',
                              backgroundColor: color + '15',
                              color,
                            }}
                          >
                            {name}
                          </div>
                          {step.deltaMs !== null && (
                            <span className="text-[9px] font-mono text-white/25 tabular-nums">
                              +{step.deltaMs}ms
                            </span>
                          )}
                        </div>

                        {/* Arrow */}
                        {!isLast && (
                          <div className="ml-[3px] w-px h-3 bg-white/10" />
                        )}
                      </div>
                    );
                  })}

                  {/* Total latency */}
                  <div className="mt-1 pt-1 border-t border-white/5 text-[9px] font-mono text-white/25 ml-4">
                    Total: {chain.totalMs}ms ({chain.steps[0].source} → {chain.steps[chain.steps.length - 1].source})
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
