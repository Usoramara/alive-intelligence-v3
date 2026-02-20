'use client';

import { useMind } from '@/hooks/use-mind';
import { ZONE_COLORS, ENGINE_ZONES } from '@/core/constants';

export function EngineStatusSummary() {
  const mind = useMind();

  let activeCount = 0;
  let processingCount = 0;
  const zoneCounts: Record<string, number> = { outer: 0, inner: 0, thalamus: 0, body: 0 };

  mind.engines.forEach((engine) => {
    if (engine.status === 'processing') {
      processingCount++;
      const zone = ENGINE_ZONES[engine.id];
      if (zone) zoneCounts[zone]++;
    }
    if (engine.status !== 'idle') {
      activeCount++;
    }
  });

  return (
    <div className="bg-white/5 rounded-lg px-4 py-3 backdrop-blur-sm border border-white/10 flex items-center gap-3">
      <span className="text-xs font-mono text-white/40 uppercase tracking-wider">
        Engines
      </span>
      <span className="text-xs font-mono text-white/60 tabular-nums">
        {processingCount} active
      </span>
      <div className="flex items-center gap-1.5">
        {(Object.entries(zoneCounts) as Array<[string, number]>).map(([zone, count]) => (
          <div key={zone} className="flex items-center gap-0.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: ZONE_COLORS[zone as keyof typeof ZONE_COLORS],
                opacity: count > 0 ? 1 : 0.2,
              }}
            />
            <span
              className="text-[9px] font-mono tabular-nums"
              style={{
                color: ZONE_COLORS[zone as keyof typeof ZONE_COLORS],
                opacity: count > 0 ? 0.8 : 0.2,
              }}
            >
              {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
