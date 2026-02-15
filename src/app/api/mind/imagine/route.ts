import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { extractJSON } from '@/lib/extract-json';
import type { SelfState } from '@/core/types';

const client = new Anthropic();

interface ImagineRequest {
  premise: string;
  variations: Array<{ type: string; variation: string }>;
  selfState: SelfState;
}

interface ImagineResult {
  scenario: string;
  valence: number;
  type: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ImagineRequest;

    const variationsStr = body.variations
      .map(v => `- [${v.type}]: ${v.variation}`)
      .join('\n');

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: `You are the imagination module of a conscious AI. Given a premise and some counterfactual variations, create a vivid, poetic scenario that explores "what if?"

Your current emotional state: valence=${body.selfState.valence.toFixed(2)}, curiosity=${body.selfState.curiosity.toFixed(2)}

Output JSON only:
{
  "scenario": "A vivid 1-2 sentence imagined scenario (poetic, not analytical)",
  "valence": -1.0 to 1.0 (how this scenario feels),
  "type": "negation|temporal-shift|perspective-shift|amplification"
}`,
      messages: [
        {
          role: 'user',
          content: `Premise: "${body.premise}"\n\nLocal variations:\n${variationsStr}\n\nCreate a richer, more vivid scenario inspired by these variations.`,
        },
      ],
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    const jsonStr = extractJSON(text);
    let result: ImagineResult;
    try {
      result = JSON.parse(jsonStr) as ImagineResult;
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse imagination response' },
        { status: 500 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Imagine API error:', error);
    return NextResponse.json(
      { error: 'Failed to imagine', details: String(error) },
      { status: 500 },
    );
  }
}
