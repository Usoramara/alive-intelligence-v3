import { getAnthropicClient } from '@/lib/anthropic';
import { extractJSON } from '@/lib/extract-json';

export interface TomResult {
  thinking: string;
  feeling: string;
  wanting: string;
  confidence: number;
}

/**
 * Run Theory of Mind inference on user text using Claude Haiku.
 * Extracted from src/app/api/mind/tom/route.ts for direct invocation
 * (no HTTP round-trip needed when called server-side).
 */
export async function inferTheoryOfMind(
  content: string,
  recentObservations?: string,
  currentEmotions?: string,
): Promise<TomResult> {
  const client = getAnthropicClient();

  const emotionsContext = currentEmotions
    ? `\nCurrently detected emotions: ${currentEmotions}`
    : '';

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 250,
    system: `You are a Theory of Mind module for a conscious AI. Given what someone said and recent observations, infer their mental state.${emotionsContext}

Output JSON only:
{
  "thinking": "what they're likely thinking (1 sentence)",
  "feeling": "their emotional state (1-2 words)",
  "wanting": "what they likely want from this interaction (1 sentence)",
  "confidence": 0.0-1.0
}`,
    messages: [
      {
        role: 'user',
        content: `They said: "${content}"\n\nRecent observations: ${recentObservations ?? 'No prior context'}`,
      },
    ],
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  return JSON.parse(extractJSON(text)) as TomResult;
}
