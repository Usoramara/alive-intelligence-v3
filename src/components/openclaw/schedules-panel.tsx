'use client';

import { useCallback, useEffect, useState } from 'react';

interface CronJob {
  id?: string;
  name?: string;
  expression?: string;
  action?: string;
  enabled?: boolean;
  lastRun?: string;
  nextRun?: string;
  [key: string]: unknown;
}

async function fetchCronJobs(): Promise<CronJob[]> {
  const res = await fetch('/api/openclaw/cron/list');
  if (!res.ok) return [];
  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.jobs)) return data.jobs;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
}

async function cronAction(action: 'add' | 'run' | 'remove', body: Record<string, unknown>) {
  const res = await fetch(`/api/openclaw/cron/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to ${action} cron job`);
  }
  return res.json();
}

export function SchedulesPanel() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newExpression, setNewExpression] = useState('');
  const [newAction, setNewAction] = useState('');

  const loadJobs = useCallback(async () => {
    const list = await fetchCronJobs();
    setJobs(list);
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const handleAdd = async () => {
    if (!newExpression.trim() || !newAction.trim()) return;
    setLoading('add');
    setError(null);
    try {
      await cronAction('add', { expression: newExpression.trim(), action: newAction.trim() });
      setNewExpression('');
      setNewAction('');
      setShowAdd(false);
      await loadJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add');
    } finally {
      setLoading(null);
    }
  };

  const handleRun = async (job: CronJob) => {
    const id = String(job.id ?? job.name ?? '');
    setLoading(`run-${id}`);
    setError(null);
    try {
      await cronAction('run', { id, name: job.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run');
    } finally {
      setLoading(null);
    }
  };

  const handleRemove = async (job: CronJob) => {
    const id = String(job.id ?? job.name ?? '');
    setLoading(`remove-${id}`);
    setError(null);
    try {
      await cronAction('remove', { id, name: job.name });
      await loadJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="bg-white/5 rounded-lg px-4 py-3 border border-white/10">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] uppercase tracking-widest text-white/30">
          Schedules
        </h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
        >
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {error && (
        <div className="text-[10px] text-red-400/80 mb-2">{error}</div>
      )}

      {showAdd && (
        <div className="flex flex-col gap-2 mb-3 p-2 bg-white/3 rounded border border-white/5">
          <input
            type="text"
            value={newExpression}
            onChange={(e) => setNewExpression(e.target.value)}
            placeholder="Cron expression (e.g. */5 * * * *)"
            className="text-xs bg-white/5 border border-white/10 rounded px-2 py-1 text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/20"
          />
          <input
            type="text"
            value={newAction}
            onChange={(e) => setNewAction(e.target.value)}
            placeholder="Action (e.g. health-check)"
            className="text-xs bg-white/5 border border-white/10 rounded px-2 py-1 text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/20"
          />
          <button
            onClick={handleAdd}
            disabled={loading !== null || !newExpression.trim() || !newAction.trim()}
            className="self-end text-[10px] px-2 py-1 rounded bg-blue-500/10 text-blue-400/70 hover:bg-blue-500/20 disabled:opacity-30 transition-colors"
          >
            {loading === 'add' ? '...' : 'Add Job'}
          </button>
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="text-xs text-white/25">No scheduled jobs</div>
      ) : (
        <div className="flex flex-col gap-2">
          {jobs.map((job, i) => {
            const id = String(job.id ?? job.name ?? `job-${i}`);
            return (
              <div key={id} className="flex items-center gap-2 text-xs">
                <div className="flex-1 min-w-0">
                  <div className="text-white/50 truncate">
                    {job.name || job.action || id}
                  </div>
                  {job.expression && (
                    <div className="text-[10px] text-white/20 font-mono">{job.expression}</div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => handleRun(job)}
                    disabled={loading !== null}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400/70 hover:bg-blue-500/20 disabled:opacity-30 transition-colors"
                  >
                    {loading === `run-${id}` ? '...' : 'Run'}
                  </button>
                  <button
                    onClick={() => handleRemove(job)}
                    disabled={loading !== null}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400/70 hover:bg-red-500/20 disabled:opacity-30 transition-colors"
                  >
                    {loading === `remove-${id}` ? '...' : 'Remove'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
