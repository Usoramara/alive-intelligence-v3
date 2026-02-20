'use client';

import { useEffect, useRef, useState } from 'react';
import { useSelfState } from '@/hooks/use-self-state';
import type { SelfStateDimension } from '@/core/types';

const DIMENSIONS: Array<{
  key: SelfStateDimension;
  label: string;
  color: string;
}> = [
  { key: 'valence', label: 'VAL', color: '#3b82f6' },
  { key: 'arousal', label: 'ARO', color: '#ef4444' },
  { key: 'confidence', label: 'CON', color: '#f59e0b' },
  { key: 'energy', label: 'NRG', color: '#10b981' },
  { key: 'social', label: 'SOC', color: '#a855f7' },
  { key: 'curiosity', label: 'CUR', color: '#06b6d4' },
];

const BUFFER_SIZE = 60;
const SAMPLE_INTERVAL = 1000;
const WIDTH = 120;
const HEIGHT = 20;

export function SelfStateTimeline() {
  const selfState = useSelfState();
  const bufferRef = useRef<Array<Record<SelfStateDimension, number>>>([]);
  const [, forceRender] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const buffer = bufferRef.current;
      buffer.push({ ...selfState });
      if (buffer.length > BUFFER_SIZE) {
        buffer.shift();
      }
      forceRender((n) => n + 1);
    }, SAMPLE_INTERVAL);

    return () => clearInterval(interval);
  }, [selfState]);

  const buffer = bufferRef.current;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {DIMENSIONS.map(({ key, label, color }) => {
        const currentValue = selfState[key];
        // Build polyline points
        const points = buffer
          .map((sample, i) => {
            const x = (i / Math.max(buffer.length - 1, 1)) * WIDTH;
            // Valence is -1 to 1, others are 0 to 1
            const normalized =
              key === 'valence' ? (sample[key] + 1) / 2 : sample[key];
            const y = HEIGHT - normalized * HEIGHT;
            return `${x},${y}`;
          })
          .join(' ');

        return (
          <div key={key} className="flex items-center gap-1.5">
            <span
              className="text-[9px] font-mono uppercase tracking-wider"
              style={{ color, opacity: 0.7 }}
            >
              {label}
            </span>
            <svg
              width={WIDTH}
              height={HEIGHT}
              className="opacity-80"
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            >
              {buffer.length > 1 && (
                <polyline
                  points={points}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {buffer.length <= 1 && (
                <line
                  x1={0}
                  y1={HEIGHT / 2}
                  x2={WIDTH}
                  y2={HEIGHT / 2}
                  stroke={color}
                  strokeWidth={0.5}
                  opacity={0.3}
                />
              )}
            </svg>
            <span
              className="text-[9px] font-mono tabular-nums"
              style={{ color, opacity: 0.6 }}
            >
              {currentValue.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
