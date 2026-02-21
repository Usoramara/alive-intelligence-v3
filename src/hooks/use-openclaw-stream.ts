'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface GatewayInfo {
  bridge: { connected: boolean; latencyMs: number | null } | null;
  health: Record<string, unknown> | null;
}

export interface ChannelInfo {
  name?: string;
  type?: string;
  status?: string;
  connected?: boolean;
  online?: boolean;
  [key: string]: unknown;
}

export interface SessionInfo {
  id?: string;
  name?: string;
  created_at?: string;
  channel?: string;
  [key: string]: unknown;
}

export interface StreamEvent {
  id: string;
  type: string;
  payload: unknown;
  timestamp: number;
}

export interface OpenClawStreamState {
  connected: boolean;
  gateway: GatewayInfo;
  channels: ChannelInfo[];
  sessions: SessionInfo[];
  events: StreamEvent[];
}

const MAX_EVENTS = 50;
const POLL_FALLBACK_MS = 15_000;
const RECONNECT_DELAY_MS = 3_000;

export function useOpenClawStream(): OpenClawStreamState {
  const [connected, setConnected] = useState(false);
  const [gateway, setGateway] = useState<GatewayInfo>({
    bridge: null,
    health: null,
  });
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [events, setEvents] = useState<StreamEvent[]>([]);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const addEvent = useCallback((type: string, payload: unknown, timestamp: number) => {
    const entry: StreamEvent = {
      id: `evt-${timestamp}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      payload,
      timestamp,
    };
    setEvents((prev) => {
      const next = [...prev, entry];
      return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
    });
  }, []);

  // Normalize channel data from various gateway response shapes
  const normalizeChannels = useCallback((raw: unknown): ChannelInfo[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'object' && raw !== null) {
      const obj = raw as Record<string, unknown>;
      if (Array.isArray(obj.channels)) return obj.channels;
      return Object.entries(obj).map(([name, val]) => ({
        name,
        ...(typeof val === 'object' && val ? (val as Record<string, unknown>) : { status: String(val) }),
      }));
    }
    return [];
  }, []);

  // Polling fallback
  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/openclaw/status');
      if (!res.ok) return;
      const data = await res.json();
      if (!mountedRef.current) return;

      setGateway({
        bridge: data.bridge ?? null,
        health: data.health?.ok ? data.health.data : (data.health ?? null),
      });
      setChannels(normalizeChannels(
        data.channels?.ok ? data.channels.data : (data.channels ?? null)
      ));
      if (data.sessions) {
        const list = Array.isArray(data.sessions) ? data.sessions : [];
        setSessions(list);
      }
    } catch {
      // Polling failed silently
    }
  }, [normalizeChannels]);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    pollStatus();
    pollTimerRef.current = setInterval(pollStatus, POLL_FALLBACK_MS);
  }, [pollStatus]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const source = new EventSource('/api/openclaw/stream');
    eventSourceRef.current = source;

    source.addEventListener('gateway-status', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (!mountedRef.current) return;
        setConnected(true);
        stopPolling();
        setGateway((prev) => ({
          bridge: data.bridge ?? prev.bridge,
          health: data.health ?? prev.health,
        }));
      } catch { /* parse error */ }
    });

    source.addEventListener('channel-update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (!mountedRef.current) return;
        setChannels(normalizeChannels(data.channels));
      } catch { /* parse error */ }
    });

    source.addEventListener('sessions-update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (!mountedRef.current) return;
        if (Array.isArray(data.sessions)) {
          setSessions(data.sessions);
        }
      } catch { /* parse error */ }
    });

    source.addEventListener('event', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (!mountedRef.current) return;
        addEvent(data.type, data.payload, data.timestamp ?? Date.now());

        // Update sessions on session events
        if (data.type === 'session.start' || data.type === 'session.end') {
          // Trigger a fresh sessions fetch on next health poll
        }
      } catch { /* parse error */ }
    });

    source.addEventListener('keepalive', () => {
      // Connection still alive
    });

    source.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
      stopPolling();
    };

    source.onerror = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      source.close();
      eventSourceRef.current = null;

      // Fall back to polling while disconnected
      startPolling();

      // Schedule reconnect
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          connectSSE();
        }
      }, RECONNECT_DELAY_MS);
    };
  }, [addEvent, normalizeChannels, startPolling, stopPolling]);

  useEffect(() => {
    mountedRef.current = true;
    connectSSE();

    return () => {
      mountedRef.current = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      stopPolling();
    };
  }, [connectSSE, stopPolling]);

  return { connected, gateway, channels, sessions, events };
}
