import { NextResponse } from 'next/server';
import { getBodyRegistry, initBodyHal } from '../../../../../openclaw/extensions/body-hal';

export async function GET(): Promise<NextResponse> {
  await initBodyHal();
  const registry = getBodyRegistry();
  const manifest = registry.getManifest();

  if (!manifest) {
    return NextResponse.json({ error: 'No body connected' }, { status: 404 });
  }

  return NextResponse.json(manifest);
}
