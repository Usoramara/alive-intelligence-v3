// ── Body Capability Manifest ──
// What can this body do? Declared by each adapter on connect.

export interface BodyManifest {
  bodyId: string;
  bodyType: 'mock' | 'mac-mini' | 'x2' | string;
  displayName: string;
  version: string;
  connectedAt: number;
  capabilities: BodyCapabilities;
  limits: BodyLimits;
}

export interface BodyCapabilities {
  locomotion: LocomotionCapability | null;
  manipulation: ManipulationCapability | null;
  perception: PerceptionCapability[];
  expression: ExpressionCapability | null;
  speech: SpeechCapability | null;
  system: SystemCapability[];
}

export interface LocomotionCapability {
  type: 'bipedal' | 'wheeled' | 'none';
  maxSpeed: number;       // m/s
  canNavigate: boolean;
  presetMotions: string[];
  dof: number;
}

export interface ManipulationCapability {
  type: 'humanoid' | 'industrial' | 'none';
  arms: number;
  grippers: number;
  maxPayload: number;     // kg
  reachRadius: number;    // m
  endEffectorModes: string[];
}

export interface PerceptionCapability {
  modality: 'rgb' | 'depth' | 'rgbd' | 'lidar' | 'microphone' | 'imu' | 'tactile';
  count: number;
  resolution?: string;
  frameRate?: number;
}

export interface ExpressionCapability {
  type: 'display-face' | 'physical-face' | 'led-array';
  emotionRange: string[];
  canSpeak: boolean;
}

export interface SpeechCapability {
  tts: boolean;
  stt: boolean;
  wakeWord: boolean;
  languages: string[];
}

export interface SystemCapability {
  name: string;
  description: string;
  commands: string[];
}

export interface BodyLimits {
  batteryPercent: number | null;  // null = plugged in / unlimited
  maxContinuousRuntime: number;   // minutes, 0 = unlimited
  operatingTempRange: [number, number]; // celsius [min, max]
}

// ── Abstract Intents ──
// What the mind wants to do (body-agnostic)

export type BodyIntent =
  | { type: 'move'; destination: string; speed?: number }
  | { type: 'gesture'; gesture: string; target?: string }
  | { type: 'look'; target: string; modality?: string }
  | { type: 'grasp'; object: string; action: 'pick-up' | 'put-down' | 'hand-over' }
  | { type: 'speak'; text: string; emotion?: string }
  | { type: 'express'; emotion: string; intensity: number }
  | { type: 'system'; command: string; params: Record<string, unknown> }
  | { type: 'composite'; intents: BodyIntent[]; mode: 'sequential' | 'parallel' };

// ── Task System Types ──

export type TaskStatus = 'pending' | 'planning' | 'executing' | 'completed' | 'failed' | 'aborted';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface TaskStep {
  id: string;
  command: string;
  params: Record<string, unknown>;
  timeout: number;        // ms
  retryPolicy: { maxRetries: number; backoffMs: number };
  dependsOn: string[];    // step IDs that must complete first
}

export interface Task {
  id: string;
  intent: BodyIntent;
  bodyId: string;
  status: TaskStatus;
  steps: TaskStep[];
  currentStepIndex: number;
  stepResults: Map<string, StepResult>;
  error?: string;
  timestamps: {
    created: number;
    planningStarted?: number;
    executionStarted?: number;
    completed?: number;
  };
}

export interface StepResult {
  stepId: string;
  status: StepStatus;
  result?: unknown;
  error?: string;
  retryCount: number;
  timestamps: {
    started: number;
    completed?: number;
  };
}

export interface CommandResult {
  ok: boolean;
  payload?: unknown;
  error?: string;
  durationMs: number;
}

// ── Task Decomposition ──

export interface DecompositionResult {
  steps: Array<{
    command: string;
    params: Record<string, unknown>;
    timeout: number;
    dependsOn: string[];
  }>;
  reasoning: string;
}

export interface DecompositionError {
  error: 'capability_mismatch';
  missing: string[];
  suggestion: string;
}

// ── Events ──

export interface TaskUpdateEvent {
  taskId: string;
  status: TaskStatus;
  currentStep?: string;
  progress: number;       // 0-1
  error?: string;
}
