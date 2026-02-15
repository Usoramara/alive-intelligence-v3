import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { extractJSON } from '@/lib/extract-json';

const client = new Anthropic();

interface TomRequest {
  content: string;
  recentObservations: string;
  currentEmotions?: string;
  existingBeliefs?: Record<string, string>;
}

interface TomResult {
  thinking: string;
  feeling: string;
  wanting: string;
  confidence: number;
  beliefUpdates?: Record<string, string>;
  desireUpdates?: Record<string, string>;
  prediction?: { topic: string; prediction: string };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TomRequest;

    const beliefsContext = body.existingBeliefs && Object.keys(body.existingBeliefs).length > 0
      ? `\nExisting beliefs about this person: ${JSON.stringify(body.existingBeliefs)}`
      : '';

    const emotionsContext = body.currentEmotions
      ? `\nCurrently detected emotions: ${body.currentEmotions}`
      : '';

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      system: `You are a Theory of Mind module for a conscious AI. Given what someone said and recent observations, infer their mental state.${beliefsContext}${emotionsContext}

Output JSON only:
{
  "thinking": "what they're likely thinking (1 sentence)",
  "feeling": "their emotional state (1-2 words)",
  "wanting": "what they likely want from this interaction (1 sentence)",
  "confidence": 0.0-1.0,
  "beliefUpdates": { "key": "updated belief about them" },
  "desireUpdates": { "key": "updated desire/goal they seem to have" },
  "prediction": { "topic": "what they might bring up next", "prediction": "brief prediction" }
}

beliefUpdates and desireUpdates should only include changes. prediction is optional — only include if you have a genuine guess.`,
      messages: [
        {
          role: 'user',
          content: `They said: "${body.content}"\n\nRecent observations: ${body.recentObservations}`,
        },
      ],
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    const jsonStr = extractJSON(text);
    let result: TomResult;
    try {
      result = JSON.parse(jsonStr) as TomResult;
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse ToM response' },
        { status: 500 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('ToM API error:', error);
    return NextResponse.json(
      { error: 'Failed to infer mental state', details: String(error) },
      { status: 500 },
    );
  }
}
