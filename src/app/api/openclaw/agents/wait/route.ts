import { openClawPost } from '@/lib/openclaw-route';

export const POST = openClawPost('agent.wait', 120_000);
