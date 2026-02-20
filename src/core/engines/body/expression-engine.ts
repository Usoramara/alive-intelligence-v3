import { Engine } from '../../engine';
import { ENGINE_IDS, SIGNAL_PRIORITIES } from '../../constants';
import { isSignal } from '../../types';
import type { Signal, SignalType } from '../../types';
import type { BodyIntent, BodyManifest } from '../../hal/types';

export interface ExpressionState {
  speaking: boolean;
  eyeTarget: { x: number; y: number };
  blinkRate: number; // blinks per minute
  microExpressions: string[];
  // New: continuous expression params driven by emotional state
  mouthCurve: number;    // -1 (frown) to 1 (smile), driven by valence
  browRaise: number;     // 0 (neutral) to 1 (raised), driven by curiosity
  browFurrow: number;    // 0 (neutral) to 1 (furrowed), driven by negative valence + arousal
  gazeWander: number;    // 0 (focused) to 1 (wandering), driven by low social engagement
  eyeWideness: number;   // 0 (squinting) to 1 (wide), driven by arousal + curiosity
  jawTension: number;    // 0 (relaxed) to 1 (tense), driven by arousal + negative valence
}

export class ExpressionEngine extends Engine {
  private expressionState: ExpressionState = {
    speaking: false,
    eyeTarget: { x: 0.5, y: 0.5 },
    blinkRate: 15,
    microExpressions: [],
    mouthCurve: 0.1,
    browRaise: 0.2,
    browFurrow: 0,
    gazeWander: 0.3,
    eyeWideness: 0.5,
    jawTension: 0,
  };

  private bodyManifest: BodyManifest | null = null;
  private lastEmittedEmotion: string | null = null;

  constructor() {
    super(ENGINE_IDS.EXPRESSION);
  }

  protected subscribesTo(): SignalType[] {
    return ['expression-update', 'empathic-state', 'love-field-update', 'voice-output', 'voice-output-partial', 'body-manifest'];
  }

  getExpressionState(): ExpressionState {
    return { ...this.expressionState };
  }

  protected process(signals: Signal[]): void {
    for (const signal of signals) {
      if (isSignal(signal, 'body-manifest')) {
        this.bodyManifest = signal.payload;
      }

      if (isSignal(signal, 'expression-update')) {
        const update = signal.payload as unknown as Partial<ExpressionState>;
        Object.assign(this.expressionState, update);
      }

      if (isSignal(signal, 'voice-output')) {
        this.expressionState.speaking = true;
        // Reset speaking after estimated duration
        const text = signal.payload.text;
        const duration = Math.max(1000, text.length * 50);
        setTimeout(() => {
          this.expressionState.speaking = false;
        }, duration);
      }

      if (isSignal(signal, 'voice-output-partial')) {
        // During streaming, show speaking animation
        this.expressionState.speaking = true;
      }

      if (isSignal(signal, 'empathic-state')) {
        const empathy = signal.payload;
        if (empathy.response === 'compassion') {
          this.expressionState.microExpressions = ['softened_brows', 'slight_frown'];
        }
      }
    }

    // Map all 6 state dimensions to continuous expression parameters
    const s = this.selfState.get();

    // Valence → mouth curve (-1 to 1 smile)
    this.expressionState.mouthCurve = s.valence * 0.8; // scale slightly

    // Curiosity → brow raise (0-1)
    this.expressionState.browRaise = s.curiosity * 0.7;

    // Negative valence + arousal → brow furrow
    this.expressionState.browFurrow = Math.max(0, -s.valence * 0.5 + s.arousal * 0.3);

    // Social engagement → gaze direction (low social = wandering gaze)
    this.expressionState.gazeWander = Math.max(0, 1 - s.social);

    // Arousal + curiosity → eye wideness
    this.expressionState.eyeWideness = 0.3 + (s.arousal + s.curiosity) * 0.35;

    // Arousal + negative valence → jaw tension
    this.expressionState.jawTension = Math.max(0, s.arousal * 0.4 + Math.max(0, -s.valence) * 0.3);

    // Blink rate: arousal modulated
    this.expressionState.blinkRate = 12 + s.arousal * 10;

    // Eye target: social engagement directs gaze
    if (s.social > 0.5) {
      // Engaged: look at user (center with slight random micro-movements)
      this.expressionState.eyeTarget = {
        x: 0.5 + (Math.random() - 0.5) * 0.05,
        y: 0.45 + (Math.random() - 0.5) * 0.05,
      };
    } else {
      // Withdrawn: gaze drifts
      this.expressionState.eyeTarget = {
        x: 0.5 + (Math.random() - 0.5) * 0.3,
        y: 0.5 + (Math.random() - 0.5) * 0.2,
      };
    }

    this.debugInfo = this.expressionState.speaking ? 'Speaking' :
      `mouth:${this.expressionState.mouthCurve.toFixed(1)} brow:${this.expressionState.browRaise.toFixed(1)}`;

    // If body has physical expression capability, emit body-intent to update it
    if (this.bodyManifest?.capabilities.expression) {
      const dominantEmotion = this.deriveDominantEmotion(s);
      if (dominantEmotion !== this.lastEmittedEmotion) {
        this.lastEmittedEmotion = dominantEmotion;
        this.emit('body-intent', {
          type: 'express',
          emotion: dominantEmotion,
          intensity: Math.abs(s.valence) * 0.5 + s.arousal * 0.5,
        } satisfies BodyIntent, {
          target: ENGINE_IDS.BODY_GATEWAY,
          priority: SIGNAL_PRIORITIES.LOW,
        });
      }
    }

    this.status = 'idle';
  }

  private deriveDominantEmotion(s: { valence: number; arousal: number; curiosity: number }): string {
    if (s.valence > 0.3 && s.arousal > 0.4) return 'happy';
    if (s.valence > 0.3) return 'neutral';
    if (s.valence < -0.3 && s.arousal > 0.5) return 'angry';
    if (s.valence < -0.3) return 'sad';
    if (s.curiosity > 0.6) return 'curious';
    if (s.arousal > 0.6) return 'surprised';
    return 'neutral';
  }
}
