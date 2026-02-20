import { z } from 'zod';

// ── Shared sub-schemas ──

const selfStateSchema = z.object({
  valence: z.number().min(-1).max(1),
  arousal: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  energy: z.number().min(0).max(1),
  social: z.number().min(0).max(1),
  curiosity: z.number().min(0).max(1),
});

const conversationMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(50_000),
});

// ── Route schemas ──

export const thinkParamsSchema = z.object({
  content: z.string().min(1).max(50_000),
  context: z.array(z.string().max(5_000)).max(50),
  selfState: selfStateSchema,
  conversationHistory: z.array(conversationMessageSchema).max(100).optional(),
  empathicState: z.object({
    mirroring: z.string().max(1_000),
    coupling: z.number().min(0).max(1),
    resonance: z.string().max(1_000),
  }).optional(),
  tomInference: z.object({
    theyFeel: z.string().max(1_000),
    theyWant: z.string().max(1_000),
    theyBelieve: z.string().max(1_000),
  }).optional(),
  recentMemories: z.array(z.string().max(5_000)).max(20).optional(),
  detectedEmotions: z.object({
    emotions: z.array(z.string().max(100)).max(20),
    valence: z.number().min(-1).max(1),
    arousal: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
  }).optional(),
  strategicPriority: z.object({
    description: z.string().max(2_000),
    priority: z.number().min(0).max(1),
    progress: z.number().min(0).max(1),
  }).optional(),
  recentInnerThoughts: z.array(z.string().max(2_000)).max(20).optional(),
  responseStyle: z.object({
    maxTokens: z.number().int().min(1).max(4096),
    urgency: z.enum(['low', 'normal', 'high']),
    tone: z.enum(['gentle', 'neutral', 'energetic']),
  }).optional(),
  workingMemorySummary: z.string().max(10_000).optional(),
  discourseContext: z.object({
    currentTopic: z.string().max(2_000).nullable(),
    openQuestions: z.array(z.string().max(2_000)).max(20),
    commitments: z.array(z.string().max(2_000)).max(20),
  }).optional(),
  metacognitionContext: z.object({
    uncertainty: z.number().min(0).max(1),
    processingLoad: z.number().min(0).max(1),
    emotionalRegulation: z.string().max(1_000).nullable(),
  }).optional(),
});

export const thinkLiteParamsSchema = z.object({
  content: z.string().min(1).max(50_000),
  context: z.array(z.string().max(5_000)).max(50),
  selfState: selfStateSchema,
  conversationHistory: z.array(conversationMessageSchema).max(100).optional(),
});

export const perceiveParamsSchema = z.object({
  frame: z.string().min(1).max(10_000_000), // base64 image can be large
  selfState: selfStateSchema,
  context: z.string().max(5_000).optional(),
});

export const detectEmotionParamsSchema = z.object({
  text: z.string().min(1).max(50_000),
  context: z.string().max(5_000).optional(),
});

export const recallParamsSchema = z.object({
  query: z.string().min(1).max(10_000),
  candidates: z.array(z.object({
    id: z.string().max(500),
    content: z.string().max(10_000),
    significance: z.number().min(0).max(1),
  })).max(100),
});

export const growParamsSchema = z.object({
  exchanges: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(50_000),
  })).max(200),
  emotionalTrajectory: z.object({
    start: z.number().min(-1).max(1),
    end: z.number().min(-1).max(1),
    peaks: z.array(z.string().max(1_000)).max(20),
  }),
});

export const tomRequestSchema = z.object({
  content: z.string().min(1).max(50_000),
  recentObservations: z.string().max(10_000),
  currentEmotions: z.string().max(2_000).optional(),
  existingBeliefs: z.record(z.string(), z.string().max(2_000)).optional(),
});

export const imagineRequestSchema = z.object({
  premise: z.string().min(1).max(10_000),
  variations: z.array(z.object({
    type: z.string().max(500),
    variation: z.string().max(5_000),
  })).max(20),
  selfState: selfStateSchema,
});

export const reflectParamsSchema = z.object({
  memories: z.array(z.string().max(5_000)).max(50).optional(),
  mood: z.object({
    valence: z.number().min(-1).max(1),
    arousal: z.number().min(0).max(1),
    energy: z.number().min(0).max(1),
  }),
  recentStream: z.string().max(20_000).optional(),
  count: z.number().int().min(1).max(12).optional(),
  flavorHints: z.array(z.string().max(100)).max(10).optional(),
});

// ── Body HAL schemas ──

const simpleBodyIntentSchema = z.union([
  z.object({ type: z.literal('move'), destination: z.string().max(1_000), speed: z.number().optional() }),
  z.object({ type: z.literal('gesture'), gesture: z.string().max(200), target: z.string().max(1_000).optional() }),
  z.object({ type: z.literal('look'), target: z.string().max(1_000), modality: z.string().max(100).optional() }),
  z.object({ type: z.literal('grasp'), object: z.string().max(1_000), action: z.enum(['pick-up', 'put-down', 'hand-over']) }),
  z.object({ type: z.literal('speak'), text: z.string().max(10_000), emotion: z.string().max(100).optional() }),
  z.object({ type: z.literal('express'), emotion: z.string().max(100), intensity: z.number().min(0).max(1) }),
  z.object({ type: z.literal('system'), command: z.string().max(500), params: z.record(z.string(), z.unknown()) }),
]);

// Composite intents contain sub-intents (only 1 level deep to avoid recursive schema complexity)
const bodyIntentSchema = z.union([
  ...simpleBodyIntentSchema.options,
  z.object({ type: z.literal('composite'), intents: z.array(simpleBodyIntentSchema).max(20), mode: z.enum(['sequential', 'parallel']) }),
]);

export const bodyExecuteSchema = z.object({
  intent: bodyIntentSchema,
  bodyId: z.string().max(200).optional(),
});

export const bodyDecomposeSchema = z.object({
  intent: bodyIntentSchema,
  manifest: z.record(z.string(), z.unknown()),
  systemPrompt: z.string().max(50_000),
  userPrompt: z.string().max(10_000),
});
