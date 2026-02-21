'use client';

import { useCallback, useEffect, useState } from 'react';

interface DeviceEntry {
  id?: string;
  deviceId?: string;
  name?: string;
  status?: string;
  platform?: string;
  lastSeen?: string;
  [key: string]: unknown;
}

async function fetchDevices(): Promise<DeviceEntry[]> {
  const res = await fetch('/api/openclaw/devices/list');
  if (!res.ok) return [];
  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.devices)) return data.devices;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
}

async function deviceAction(action: 'approve' | 'reject' | 'remove', deviceId: string) {
  const res = await fetch(`/api/openclaw/devices/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to ${action} device`);
  }
  return res.json();
}

export function DevicesPanel() {
  const [devices, setDevices] = useState<DeviceEntry[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    const list = await fetchDevices();
    setDevices(list);
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const handleAction = async (action: 'approve' | 'reject' | 'remove', device: DeviceEntry) => {
    const id = String(device.deviceId ?? device.id ?? '');
    if (!id) return;
    setLoading(`${action}-${id}`);
    setError(null);
    try {
      await deviceAction(action, id);
      await loadDevices();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setLoading(null);
    }
  };

  const statusColor = (status?: string) => {
    if (!status) return 'text-white/30';
    if (status === 'approved' || status === 'active') return 'text-emerald-400/70';
    if (status === 'pending') return 'text-amber-400/70';
    if (status === 'rejected') return 'text-red-400/70';
    return 'text-white/40';
  };

  return (
    <div className="bg-white/5 rounded-lg px-4 py-3 border border-white/10">
      <h3 className="text-[10px] uppercase tracking-widest text-white/30 mb-2">
        Devices
      </h3>

      {error && (
        <div className="text-[10px] text-red-400/80 mb-2">{error}</div>
      )}

      {devices.length === 0 ? (
        <div className="text-xs text-white/25">No devices</div>
      ) : (
        <div className="flex flex-col gap-2">
          {devices.map((device, i) => {
            const id = String(device.deviceId ?? device.id ?? `device-${i}`);
            const name = String(device.name ?? id);
            const isPending = device.status === 'pending';

            return (
              <div key={id} className="flex items-center gap-2 text-xs">
                <div className="flex-1 min-w-0">
                  <div className="text-white/50 truncate">{name}</div>
                  <div className="flex gap-2 text-[10px]">
                    {device.status && (
                      <span className={statusColor(device.status)}>{device.status}</span>
                    )}
                    {device.platform && (
                      <span className="text-white/20">{String(device.platform)}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {isPending && (
                    <>
                      <button
                        onClick={() => handleAction('approve', device)}
                        disabled={loading !== null}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400/70 hover:bg-emerald-500/20 disabled:opacity-30 transition-colors"
                      >
                        {loading === `approve-${id}` ? '...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => handleAction('reject', device)}
                        disabled={loading !== null}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400/70 hover:bg-red-500/20 disabled:opacity-30 transition-colors"
                      >
                        {loading === `reject-${id}` ? '...' : 'Reject'}
                      </button>
                    </>
                  )}
                  {!isPending && (
                    <button
                      onClick={() => handleAction('remove', device)}
                      disabled={loading !== null}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400/70 hover:bg-red-500/20 disabled:opacity-30 transition-colors"
                    >
                      {loading === `remove-${id}` ? '...' : 'Remove'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
