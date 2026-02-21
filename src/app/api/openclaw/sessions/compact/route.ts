import { openClawPost } from '@/lib/openclaw-route';

export const POST = openClawPost('sessions.compact', 30_000);
