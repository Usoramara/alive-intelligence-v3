import type { EngineId, Zone } from './constants';
import type { SignalPayloadMap } from './signal-payloads';

// ── Signal Types ──

export type SignalType =
  // Sensor signals
  | 'text-input'
  | 'camera-frame'
  | 'audio-chunk'
  | 'speech-text'
  // Perception signals
  | 'perception-result'
  | 'visual-description'
  | 'emotion-detected'
  // Attention signals
  | 'attention-focus'
  | 'saliency-map'
  // Integration signals
  | 'bound-representation'
  | 'action-decision'
  // Reasoning signals
  | 'thought'
  | 'claude-response'
  | 'tom-inference'
  | 'perspective-update'
  // Emotion signals
  | 'emotion-update'
  | 'person-state-update'
  | 'empathic-state'
  | 'valence-shift'
  // Inner world signals
  | 'imagination-result'
  | 'intuition-alert'
  | 'hope-worry-update'
  | 'strategy-update'
  | 'default-mode-thought'
  | 'replay-memory'
  | 'love-field-update'
  | 'growth-insight'
  // Values
  | 'value-check'
  | 'value-violation'
  // Memory signals
  | 'memory-query'
  | 'memory-result'
  | 'memory-write'
  | 'memory-significance'
  // Safety signals
  | 'safety-alert'
  | 'safety-clear'
  // Output signals
  | 'voice-output'
  | 'voice-output-partial'
  | 'expression-update'
  | 'motor-command'
  | 'locomotion-update'
  // Consciousness stream signals
  | 'stream-thought'
  | 'drive-pulse'
  // Working memory & discourse signals
  | 'working-memory-update'
  | 'discourse-state'
  | 'item-evicted'
  // Theory of Mind & prediction signals
  | 'tom-model-update'
  | 'prediction-validated'
  | 'prediction-error'
  // Metacognition signals
  | 'metacognition-update'
  // Resource management signals
  | 'resource-budget'
  // Tool activity signals
  | 'tool-activity'
  // Body HAL signals
  | 'body-intent'
  | 'body-feedback'
  | 'body-manifest'
  | 'body-status'
  | 'body-task-update'
  // System signals
  | 'engine-status'
  | 'persist-state'
  | 'state-restored';

export interface Signal<T extends SignalType = SignalType> {
  id: string;
  type: T;
  source: EngineId;
  target?: EngineId | EngineId[];  // undefined = broadcast
  payload: T extends keyof SignalPayloadMap ? SignalPayloadMap[T] : unknown;
  priority: number;
  timestamp: number;
  ttl: number;  // ms until expiry
}

// Type guard for narrowing signal payloads
export function isSignal<T extends SignalType>(
  signal: Signal,
  type: T,
): signal is Signal<T> {
  return signal.type === type;
}

// ── Consciousness Stream ──

export interface StreamEntry {
  text: string;
  source: string;
  flavor: 'wandering' | 'emotional' | 'memory' | 'curiosity' | 'reflection' | 'urge' | 'metacognitive';
  timestamp: number;
  intensity: number; // 0-1
}

export interface DrivePulse {
  drive: 'explore' | 'rest' | 'process' | 'ruminate' | 'appreciate' | 'reach-out';
  intensity: number;
  text: string;
}

// ── Self State ──

export interface SelfState {
  valence: number;     // -1 (negative) to 1 (positive)
  arousal: number;     // 0 (calm) to 1 (excited)
  confidence: number;  // 0 (uncertain) to 1 (certain)
  energy: number;      // 0 (depleted) to 1 (full)
  social: number;      // 0 (withdrawn) to 1 (engaged)
  curiosity: number;   // 0 (bored) to 1 (fascinated)
}

export type SelfStateDimension = keyof SelfState;

// ── Person State ──

// 12-dimensional state vector per known person
export interface PersonState {
  id: string;
  name: string;
  // Observed emotional state
  valence: number;
  arousal: number;
  // Inferred mental states
  engagement: number;
  trust: number;
  openness: number;
  stress: number;
  // Relationship
  familiarity: number;
  warmth: number;
  // Wybe's feelings toward this person
  attachment: number;
  curiosityAbout: number;
  protectiveness: number;
  admiration: number;
  // Last interaction
  lastSeen: number;
}

// ── Engine Types ──

export type EngineStatus = 'idle' | 'processing' | 'waiting' | 'error';

export interface EngineSnapshot {
  id: EngineId;
  zone: Zone;
  status: EngineStatus;
  lastTick: number;
  tickCount: number;
  signalsProcessed: number;
  debugInfo?: string;
}

// ── Mind Snapshot ──

export interface MindSnapshot {
  tick: number;
  timestamp: number;
  selfState: SelfState;
  engines: Map<EngineId, EngineSnapshot>;
  activeSignals: Signal[];
  signalHistory: Signal[];
  persons: Map<string, PersonState>;
}

// ── Subscription Types ──

export type SignalHandler = (signal: Signal) => void;

export interface Subscription {
  id: string;
  engineId: EngineId;
  signalTypes?: SignalType[];
  handler: SignalHandler;
}

// ── Shared Engine Interfaces ──

export interface BoundRepresentation {
  content: string;
  context: string[];
  selfState: SelfState;
  timestamp: number;
  needsClaude: boolean;
}

export interface ResponseStyle {
  maxTokens: number;
  urgency: 'low' | 'normal' | 'high';
  tone: 'gentle' | 'neutral' | 'energetic';
}

export interface ActionDecision {
  action: 'respond' | 'think' | 'observe' | 'wait';
  content: string;
  context: string[];
  selfState: SelfState;
  timestamp: number;
  empathicState?: { mirroring: string; coupling: number; resonance: string };
  tomInference?: { theyFeel: string; theyWant: string; theyBelieve: string };
  recentMemories?: string[];
  detectedEmotions?: { emotions: string[]; valence: number; arousal: number; confidence: number };
  strategicPriority?: { description: string; priority: number; progress: number };
  recentInnerThoughts?: string[];
  responseStyle?: ResponseStyle;
  workingMemorySummary?: string;
  discourseContext?: { currentTopic: string | null; openQuestions: string[]; commitments: string[] };
  metacognitionContext?: { uncertainty: number; processingLoad: number; emotionalRegulation: string | null };
  useLite?: boolean;
}

export interface AttentionFocus {
  content: string;
  modality: string;
  salience: number;
  urgency: number;
  timestamp: number;
}

export interface EmotionDetection {
  emotions: string[];
  valence: number;
  arousal: number;
  confidence: number;
}

export interface PerceptionResult {
  description: string;
  emotions?: { detected: string[]; confidence: number };
  people?: Array<{ expression: string; estimatedMood: string }>;
}

// ── Claude Integration ──

export interface ThinkRequest {
  prompt: string;
  systemPrompt?: string;
  selfState: SelfState;
  recentSignals: Signal[];
  personContext?: PersonState;
}

export interface ThinkResponse {
  text: string;
  emotionShift?: Partial<SelfState>;
  signals?: Array<{
    type: SignalType;
    payload: unknown;
  }>;
}

export interface PerceiveRequest {
  frame: string;  // base64 image
  selfState: SelfState;
  context?: string;
}

export interface PerceiveResponse {
  description: string;
  emotions?: {
    detected: string[];
    confidence: number;
  };
  objects?: string[];
  people?: Array<{
    expression: string;
    estimatedMood: string;
  }>;
}
