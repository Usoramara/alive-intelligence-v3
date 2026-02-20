import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

async function findOpenclawBin(): Promise<string | null> {
  // Check PATH first
  try {
    const { stdout } = await exec('which', ['openclaw']);
    return stdout.trim();
  } catch {
    // not in PATH
  }

  // Fallback to common local locations
  const candidates = [
    `${process.env.HOME}/.openclaw/bin/openclaw`,
    `${process.env.HOME}/.local/bin/openclaw`,
    '/usr/local/bin/openclaw',
  ];

  for (const candidate of candidates) {
    try {
      await exec(candidate, ['--version']);
      return candidate;
    } catch {
      // try next
    }
  }

  return null;
}

async function runOpenclawCommand(
  bin: string,
  args: string[],
): Promise<unknown | null> {
  try {
    const { stdout } = await exec(bin, args, { timeout: 10000 });
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

export async function GET() {
  const bin = await findOpenclawBin();

  if (!bin) {
    return NextResponse.json({
      gatewayOnline: false,
      health: null,
      channels: null,
      sessions: null,
      error: 'OpenClaw CLI not found',
    });
  }

  // Run commands in parallel
  const [health, channels, sessions] = await Promise.all([
    runOpenclawCommand(bin, ['health', '--json']),
    runOpenclawCommand(bin, ['status', '--json']),
    runOpenclawCommand(bin, ['sessions', '--json']),
  ]);

  const gatewayOnline = health !== null;

  return NextResponse.json({
    gatewayOnline,
    health,
    channels,
    sessions,
    error: gatewayOnline ? null : 'Gateway not running',
  });
}
