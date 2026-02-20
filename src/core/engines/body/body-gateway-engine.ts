import { Engine } from '../../engine';
import { ENGINE_IDS, SIGNAL_PRIORITIES } from '../../constants';
import { isSignal } from '../../types';
import type { Signal, SignalType } from '../../types';
import type { BodyManifest, BodyIntent, TaskStatus } from '../../hal/types';

/**
 * BodyGatewayEngine — the cognitive bridge between mind and body.
 *
 * Zone: body
 * Tick: 100ms
 *
 * Subscribes to: body-intent, body-manifest, body-feedback, body-task-update, motor-command
 * Emits: body-intent (validated), body-feedback (routed to arbiter/expression)
 *
 * Responsibilities:
 * - Caches BodyManifest from body-manifest signals
 * - Validates incoming body-intent against capabilities
 * - Routes body-feedback to appropriate engines
 * - Converts legacy motor-command signals into body-intent
 * - Nudges self-state on task events
 */
export class BodyGatewayEngine extends Engine {
  private manifest: BodyManifest | null = null;
  private activeTaskCount = 0;
  private lastTaskStatus: string | null = null;

  constructor() {
    super(ENGINE_IDS.BODY_GATEWAY);
  }

  protected subscribesTo(): SignalType[] {
    return [
      'body-intent',
      'body-manifest',
      'body-feedback',
      'body-task-update',
      'motor-command',
    ];
  }

  getManifest(): BodyManifest | null {
    return this.manifest;
  }

  getActiveTaskCount(): number {
    return this.activeTaskCount;
  }

  protected process(signals: Signal[]): void {
    for (const signal of signals) {
      if (isSignal(signal, 'body-manifest')) {
        this.manifest = signal.payload;
        this.debugInfo = `Body: ${this.manifest.displayName}`;

        // Notify the system about body status
        this.emit('body-status', {
          bodyId: this.manifest.bodyId,
          connected: true,
          bodyType: this.manifest.bodyType,
        }, {
          priority: SIGNAL_PRIORITIES.MEDIUM,
        });
      }

      if (isSignal(signal, 'body-intent')) {
        this.handleIntent(signal.payload, signal.source);
      }

      if (isSignal(signal, 'body-feedback')) {
        this.handleFeedback(signal.payload);
      }

      if (isSignal(signal, 'body-task-update')) {
        this.handleTaskUpdate(signal.payload);
      }

      // Backward compatibility: convert motor-command to body-intent
      if (isSignal(signal, 'motor-command')) {
        const cmd = signal.payload;
        if (cmd.action === 'halt') {
          // Safety halt — don't convert, handle directly
          this.debugInfo = 'Motor halted (safety)';
        } else {
          // Convert motor command to body-intent gesture
          this.emit('body-intent', {
            type: 'gesture',
            gesture: cmd.action,
          } satisfies BodyIntent, {
            priority: SIGNAL_PRIORITIES.MEDIUM,
          });
        }
      }
    }

    this.status = this.activeTaskCount > 0 ? 'processing' : 'idle';
  }

  private handleIntent(intent: BodyIntent, source: string): void {
    if (!this.manifest) {
      // No body connected — emit error feedback
      this.emit('body-feedback', {
        taskId: '',
        status: 'failed' as TaskStatus,
        error: 'No body connected',
      }, {
        priority: SIGNAL_PRIORITIES.MEDIUM,
      });
      return;
    }

    // Quick capability validation
    const capError = this.quickCapabilityCheck(intent);
    if (capError) {
      this.emit('body-feedback', {
        taskId: '',
        status: 'failed' as TaskStatus,
        error: capError,
      }, {
        priority: SIGNAL_PRIORITIES.MEDIUM,
      });

      // Mild frustration from capability mismatch
      this.selfState.nudge('valence', -0.01);

      // Push to consciousness stream
      this.selfState.pushStream({
        text: `I can't do that — ${capError}`,
        source: 'body-gateway',
        flavor: 'reflection',
        timestamp: Date.now(),
        intensity: 0.4,
      });
      return;
    }

    // Intent is valid — BodyBridge will pick it up and send to server
    // (The signal is already on the bus from whoever emitted it)
    this.debugInfo = `Intent: ${intent.type}`;
  }

  private handleFeedback(payload: { taskId: string; status: TaskStatus; result?: unknown; error?: string }): void {
    switch (payload.status) {
      case 'completed':
        this.activeTaskCount = Math.max(0, this.activeTaskCount - 1);
        this.selfState.nudge('confidence', 0.02);
        this.selfState.nudge('energy', -0.01);
        this.lastTaskStatus = 'completed';

        // Push success to consciousness stream
        this.selfState.pushStream({
          text: 'I completed the action successfully.',
          source: 'body-gateway',
          flavor: 'reflection',
          timestamp: Date.now(),
          intensity: 0.3,
        });
        break;

      case 'failed':
        this.activeTaskCount = Math.max(0, this.activeTaskCount - 1);
        this.selfState.nudge('confidence', -0.03);
        this.selfState.nudge('arousal', 0.02);
        this.lastTaskStatus = 'failed';

        this.selfState.pushStream({
          text: payload.error
            ? `I couldn't complete the action: ${payload.error}`
            : 'Something went wrong with the action.',
          source: 'body-gateway',
          flavor: 'reflection',
          timestamp: Date.now(),
          intensity: 0.5,
        });
        break;

      case 'aborted':
        this.activeTaskCount = Math.max(0, this.activeTaskCount - 1);
        this.lastTaskStatus = 'aborted';
        break;
    }

    this.debugInfo = `Last task: ${this.lastTaskStatus}`;
  }

  private handleTaskUpdate(payload: { taskId: string; status: TaskStatus; progress: number; currentStep?: string }): void {
    if (payload.status === 'executing') {
      this.activeTaskCount = Math.max(1, this.activeTaskCount);
      this.status = 'processing';
    }
  }

  private quickCapabilityCheck(intent: BodyIntent): string | null {
    if (!this.manifest) return 'No body connected';

    const caps = this.manifest.capabilities;

    switch (intent.type) {
      case 'move':
        if (!caps.locomotion || caps.locomotion.type === 'none') {
          return `No locomotion capability on this body (${this.manifest.displayName})`;
        }
        break;
      case 'grasp':
        if (!caps.manipulation) {
          return `No manipulation capability — no arms on this body`;
        }
        break;
      case 'speak':
        if (!caps.speech?.tts) {
          return 'No text-to-speech capability';
        }
        break;
      case 'gesture': {
        const hasPreset = caps.locomotion?.presetMotions.includes(intent.gesture);
        if (!hasPreset && !caps.manipulation) {
          return `Unknown gesture "${intent.gesture}" and no manipulation capability`;
        }
        break;
      }
    }

    return null;
  }
}
