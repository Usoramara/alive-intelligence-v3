import { openClawPost } from '@/lib/openclaw-route';

export const POST = openClawPost('browser.request', 30_000);
