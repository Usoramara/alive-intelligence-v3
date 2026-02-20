import { getAnthropicClient } from '@/lib/anthropic';
import { createApiHandler } from '@/lib/api-handler';
import { bodyDecomposeSchema } from '@/lib/schemas';

const client = getAnthropicClient();

export const POST = createApiHandler({
  schema: bodyDecomposeSchema,
  handler: async (params) => {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: params.systemPrompt,
      messages: [{ role: 'user', content: params.userPrompt }],
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    // Parse Claude's JSON response
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, text];
      const json = JSON.parse(jsonMatch[1]!.trim());
      return json;
    } catch {
      const intent = params.intent as Record<string, unknown>;
      return {
        error: 'decomposition_parse_error',
        raw: text,
        // Fall back to a single-step plan
        steps: [{
          command: `body.${intent.type}`,
          params: intent,
          timeout: 15000,
          dependsOn: [],
        }],
        reasoning: 'Fallback: Claude response could not be parsed, using direct intent',
      };
    }
  },
});
