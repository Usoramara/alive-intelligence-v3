/**
 * Factory helpers for OpenClaw API route handlers.
 *
 * Each factory returns a Next.js route handler that:
 *  1. Validates auth via validateOpenClawAuth()
 *  2. (POST only) Parses JSON body
 *  3. Calls callOpenClaw() with the given method
 *  4. Returns { ok, data } or { ok, error } with appropriate status
 */

import { NextResponse } from 'next/server';
import { validateOpenClawAuth } from '@/lib/openclaw-auth';
import { callOpenClaw } from '@/lib/openclaw-rpc';

/**
 * Create a GET route handler that forwards to an OpenClaw RPC method.
 */
export function openClawGet(method: string, timeoutMs?: number) {
  return async function GET(request: Request) {
    const auth = validateOpenClawAuth(request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    const result = await callOpenClaw(method, undefined, timeoutMs);
    if (!result.ok) {
      return NextResponse.json({ error: result.error.message }, { status: 502 });
    }
    return NextResponse.json(result.data);
  };
}

/**
 * Create a POST route handler that forwards the JSON body to an OpenClaw RPC method.
 */
export function openClawPost(method: string, timeoutMs?: number) {
  return async function POST(request: Request) {
    const auth = validateOpenClawAuth(request);
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const result = await callOpenClaw(method, body, timeoutMs);
    if (!result.ok) {
      return NextResponse.json({ error: result.error.message }, { status: 502 });
    }
    return NextResponse.json(result.data);
  };
}
