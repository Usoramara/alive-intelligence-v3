import { openClawPost } from '@/lib/openclaw-route';
export const POST = openClawPost('chat.send', 30_000);
