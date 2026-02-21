/**
 * Generic RPC proxy — forwards any method call to the OpenClaw gateway.
 *
 * POST /api/openclaw/rpc
 * Body: { "method": "chat.send", "params": { ... }, "timeoutMs": 15000 }
 */

import { NextResponse } from 'next/server';
import { validateOpenClawAuth } from '@/lib/openclaw-auth';
import { callOpenClaw } from '@/lib/openclaw-rpc';

const MAX_TIMEOUT = 120_000;
const DEFAULT_TIMEOUT = 8_000;

export async function POST(request: Request) {
  const auth = validateOpenClawAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  let body: { method?: string; params?: unknown; timeoutMs?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.method || typeof body.method !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid "method" string' }, { status: 400 });
  }

  const timeoutMs = Math.min(
    typeof body.timeoutMs === 'number' && body.timeoutMs > 0 ? body.timeoutMs : DEFAULT_TIMEOUT,
    MAX_TIMEOUT,
  );

  const result = await callOpenClaw(body.method, body.params, timeoutMs);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, data: result.data });
}
