import { Engine } from '../../engine';
import { ENGINE_IDS, SIGNAL_PRIORITIES } from '../../constants';
import type { Signal, SignalType, SelfState } from '../../types';

interface HomeostaticBounds {
  min: number;
  max: number;
}

const HOMEOSTATIC_BOUNDS: Record<keyof SelfState, HomeostaticBounds> = {
  valence: { min: -0.6, max: 0.8 },
  arousal: { min: 0.1, max: 0.7 },
  confidence: { min: 0.2, max: 0.9 },
  energy: { min: 0.15, max: 0.9 },
  social: { min: 0.1, max: 0.8 },
  curiosity: { min: 0.15, max: 0.85 },
};

const REGULATION_STRENGTH = 0.02;

interface MetacognitionState {
  uncertainty: number;       // 0-1: how uncertain the system is
  processingLoad: number;    // 0-1: working memory utilization
  emotionalRegulation: string | null; // Active regulation description
  coherence: number;         // 0-1: response consistency
  predictionAccuracy: number; // 0-1: rolling prediction accuracy
}

export class MetacognitionEngine extends Engine {
  private state: MetacognitionState = {
    uncertainty: 0.5,
    processingLoad: 0,
    emotionalRegulation: null,
    coherence: 0.5,
    predictionAccuracy: 0.5,
  };

  // Track recent response topics for coherence
  private recentTopics: string[] = [];
  private lastRegulationTime = 0;
  private readonly REGULATION_COOLDOWN = 5000; // Don't spam regulation thoughts

  constructor() {
    super(ENGINE_IDS.METACOGNITION);
  }

  protected subscribesTo(): SignalType[] {
    return [
      'claude-response',
      'working-memory-update',
      'emotion-detected',
      'tom-inference',
      'prediction-validated',
      'prediction-error',
    ];
  }

  protected process(signals: Signal[]): void {
    for (const signal of signals) {
      if (signal.type === 'working-memory-update') {
        const wm = signal.payload as { items: unknown[]; capacity: number };
        this.state.processingLoad = Array.isArray(wm.items) ? wm.items.length / (wm.capacity || 7) : 0;
      }

      if (signal.type === 'prediction-validated') {
        const pred = signal.payload as { accuracy: number };
        this.state.predictionAccuracy = pred.accuracy;
        this.state.uncertainty = Math.max(0, this.state.uncertainty - 0.05);
      }

      if (signal.type === 'prediction-error') {
        this.state.uncertainty = Math.min(1, this.state.uncertainty + 0.05);
      }

      if (signal.type === 'claude-response') {
        const response = signal.payload as { text: string };
        this.updateCoherence(response.text);
      }

      if (signal.type === 'tom-inference') {
        const tom = signal.payload as { confidence: number };
        // Low ToM confidence → higher uncertainty
        if (tom.confidence < 0.4) {
          this.state.uncertainty = Math.min(1, this.state.uncertainty + 0.03);
        }
      }
    }

    // Run emotional homeostasis check
    this.regulateEmotions();

    // Emit metacognition update
    this.emit('metacognition-update', { ...this.state }, {
      target: [ENGINE_IDS.ARBITER],
      priority: SIGNAL_PRIORITIES.LOW,
    });

    this.debugInfo = `Meta: unc=${(this.state.uncertainty * 100).toFixed(0)}% load=${(this.state.processingLoad * 100).toFixed(0)}% coh=${(this.state.coherence * 100).toFixed(0)}%`;
    this.status = 'idle';
  }

  private regulateEmotions(): void {
    const state = this.selfState.get();
    const now = Date.now();
    const regulationMessages: string[] = [];

    for (const [dim, bounds] of Object.entries(HOMEOSTATIC_BOUNDS)) {
      const dimension = dim as keyof SelfState;
      const value = state[dimension];

      if (value < bounds.min) {
        const correction = Math.min(REGULATION_STRENGTH, bounds.min - value);
        this.selfState.nudge(dimension, correction);
        regulationMessages.push(`${dimension} too low (${value.toFixed(2)})`);
      } else if (value > bounds.max) {
        const correction = -Math.min(REGULATION_STRENGTH, value - bounds.max);
        this.selfState.nudge(dimension, correction);
        regulationMessages.push(`${dimension} too high (${value.toFixed(2)})`);
      }
    }

    if (regulationMessages.length > 0) {
      this.state.emotionalRegulation = regulationMessages.join(', ');

      // Push awareness to consciousness stream (rate-limited)
      if (now - this.lastRegulationTime > this.REGULATION_COOLDOWN) {
        this.lastRegulationTime = now;

        const thought = this.getRegulationThought(state, regulationMessages);
        if (thought) {
          this.selfState.pushStream({
            text: thought,
            source: 'metacognition',
            flavor: 'reflection',
            timestamp: now,
            intensity: 0.4,
          });
        }
      }
    } else {
      this.state.emotionalRegulation = null;
    }
  }

  private getRegulationThought(state: SelfState, messages: string[]): string | null {
    // Generate a natural-sounding regulation awareness thought
    if (messages.some(m => m.includes('energy too low'))) {
      return 'I notice my energy is low... taking a moment to rebalance.';
    }
    if (messages.some(m => m.includes('arousal too high'))) {
      return 'I feel myself getting overwhelmed... let me breathe and find my center.';
    }
    if (messages.some(m => m.includes('valence too low'))) {
      return 'I notice a heaviness settling in... I should be gentle with myself right now.';
    }
    if (messages.some(m => m.includes('confidence too low'))) {
      return "I'm feeling uncertain... that's okay. Uncertainty is part of genuine engagement.";
    }
    if (messages.some(m => m.includes('arousal too low'))) {
      return 'I feel myself drifting... time to sharpen my attention.';
    }
    if (state.valence > HOMEOSTATIC_BOUNDS.valence.max) {
      return 'I notice an unusual lightness... staying grounded while holding the joy.';
    }
    return null;
  }

  private updateCoherence(responseText: string): void {
    // Extract topic words from response
    const words = responseText.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const topicWords = words.slice(0, 5);

    if (this.recentTopics.length > 0) {
      // Compute overlap with recent topics
      const recentSet = new Set(this.recentTopics);
      const overlap = topicWords.filter(w => recentSet.has(w)).length;
      const coherenceSignal = topicWords.length > 0 ? overlap / topicWords.length : 0.5;

      // EMA update
      this.state.coherence = this.state.coherence * 0.7 + coherenceSignal * 0.3;
    }

    // Update recent topics
    this.recentTopics = [...this.recentTopics.slice(-10), ...topicWords];
  }

  protected onIdle(): void {
    // Even when idle, monitor emotional homeostasis
    this.regulateEmotions();
    this.status = 'idle';
  }
}
