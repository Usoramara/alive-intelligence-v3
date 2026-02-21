import { openClawPost } from '@/lib/openclaw-route';
export const POST = openClawPost('logs.tail', 15_000);
