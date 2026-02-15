import { Engine } from '../../engine';
import { ENGINE_IDS, SIGNAL_PRIORITIES } from '../../constants';
import type { Signal, SignalType, SelfState } from '../../types';

interface BoundRepresentation {
  content: string;
  context: string[];
  selfState: SelfState;
  timestamp: number;
}

interface TomInference {
  thinking: string;
  feeling: string;
  wanting: string;
  confidence: number;
}

interface MentalModel {
  beliefs: Map<string, { value: string; confidence: number; updatedAt: number }>;
  desires: Map<string, { value: string; intensity: number; updatedAt: number }>;
  emotions: Map<string, { value: number; updatedAt: number }>;
  predictions: Array<{ topic: string; prediction: string; confidence: number; createdAt: number; validated?: boolean }>;
  observations: Array<{ content: string; timestamp: number }>;
}

export class TomEngine extends Engine {
  private lastInference: TomInference | null = null;
  private lastInferenceTime = 0;
  private pendingContent: string | null = null;

  // Maintained mental model
  private model: MentalModel = {
    beliefs: new Map(),
    desires: new Map(),
    emotions: new Map(),
    predictions: [],
    observations: [],
  };

  // Prediction tracking
  private predictionAccuracy = 0.5; // rolling accuracy

  constructor() {
    super(ENGINE_IDS.TOM);
  }

  protected subscribesTo(): SignalType[] {
    return ['bound-representation', 'person-state-update', 'visual-description', 'memory-result', 'emotion-detected'];
  }

  protected process(signals: Signal[]): void {
    for (const signal of signals) {
      if (signal.type === 'bound-representation') {
        const bound = signal.payload as BoundRepresentation;
        this.pendingContent = bound.content;

        // Add observation
        this.model.observations.push({
          content: bound.content,
          timestamp: Date.now(),
        });
        if (this.model.observations.length > 20) this.model.observations.shift();

        // Validate predictions against actual input
        this.validatePredictions(bound.content);
      } else if (signal.type === 'emotion-detected') {
        const emotions = signal.payload as { emotions: string[]; valence: number };
        // Directly update model's emotion component
        for (const emotion of emotions.emotions) {
          this.model.emotions.set(emotion, { value: emotions.valence, updatedAt: Date.now() });
        }
      }
    }

    // Rate-limit ToM inferences
    if (this.pendingContent && Date.now() - this.lastInferenceTime > 3000) {
      this.infer(this.pendingContent);
      this.pendingContent = null;
    }

    this.status = 'idle';
  }

  private validatePredictions(actualContent: string): void {
    const now = Date.now();
    const recentPredictions = this.model.predictions.filter(
      p => !p.validated && now - p.createdAt < 30000
    );

    for (const pred of recentPredictions) {
      // Check if prediction topic appears in actual content
      const topicWords = pred.topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const contentLower = actualContent.toLowerCase();
      const matches = topicWords.filter(w => contentLower.includes(w)).length;
      const overlap = topicWords.length > 0 ? matches / topicWords.length : 0;

      if (overlap > 0.3) {
        pred.validated = true;
        // Update rolling accuracy
        this.predictionAccuracy = this.predictionAccuracy * 0.8 + 0.2;
        this.selfState.nudge('confidence', 0.05);

        this.emit('prediction-validated', {
          prediction: pred.prediction,
          topic: pred.topic,
          accuracy: this.predictionAccuracy,
        }, {
          target: [ENGINE_IDS.ARBITER, ENGINE_IDS.PERSPECTIVE],
          priority: SIGNAL_PRIORITIES.MEDIUM,
        });

        // Push prediction confirmation to stream
        this.selfState.pushStream({
          text: `I had a feeling they might bring up ${pred.topic}...`,
          source: 'tom',
          flavor: 'curiosity',
          timestamp: now,
          intensity: 0.6,
        });
      }
    }

    // Mark old unvalidated predictions as failures
    for (const pred of this.model.predictions) {
      if (!pred.validated && now - pred.createdAt > 30000) {
        pred.validated = false;
        this.predictionAccuracy = this.predictionAccuracy * 0.9 + 0.1 * 0;
      }
    }

    // Clean up old predictions
    this.model.predictions = this.model.predictions.filter(
      p => now - p.createdAt < 60000
    );
  }

  private async infer(content: string): Promise<void> {
    this.status = 'waiting';
    this.lastInferenceTime = Date.now();

    // Build context from mental model
    const recentObs = this.model.observations.slice(-5).map(o => o.content).join(' | ');
    const currentEmotions = [...this.model.emotions.entries()]
      .map(([k, v]) => `${k}: ${v.value.toFixed(1)}`)
      .join(', ');

    try {
      const response = await fetch('/api/mind/tom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          recentObservations: recentObs,
          currentEmotions: currentEmotions || undefined,
          existingBeliefs: Object.fromEntries(
            [...this.model.beliefs.entries()].map(([k, v]) => [k, v.value])
          ),
        }),
      });

      if (!response.ok) return;

      const result = await response.json() as {
        thinking: string;
        feeling: string;
        wanting: string;
        confidence: number;
        beliefUpdates?: Record<string, string>;
        desireUpdates?: Record<string, string>;
        prediction?: { topic: string; prediction: string };
      };

      this.lastInference = {
        thinking: result.thinking,
        feeling: result.feeling,
        wanting: result.wanting,
        confidence: result.confidence,
      };

      // Update mental model with belief/desire changes
      if (result.beliefUpdates) {
        for (const [key, value] of Object.entries(result.beliefUpdates)) {
          this.model.beliefs.set(key, { value, confidence: result.confidence, updatedAt: Date.now() });
        }
      }
      if (result.desireUpdates) {
        for (const [key, value] of Object.entries(result.desireUpdates)) {
          this.model.desires.set(key, { value, intensity: 0.6, updatedAt: Date.now() });
        }
      }

      // Store prediction if provided
      if (result.prediction) {
        this.model.predictions.push({
          ...result.prediction,
          confidence: result.confidence,
          createdAt: Date.now(),
        });
      }

      // Emit model update signal
      this.emit('tom-inference', {
        ...this.lastInference,
        theyFeel: result.feeling,
        theyWant: result.wanting,
        theyBelieve: result.thinking,
      }, {
        target: [ENGINE_IDS.PERSPECTIVE, ENGINE_IDS.ARBITER],
        priority: SIGNAL_PRIORITIES.MEDIUM,
      });

      this.emit('tom-model-update', {
        beliefs: Object.fromEntries(this.model.beliefs),
        emotions: Object.fromEntries(this.model.emotions),
        predictionAccuracy: this.predictionAccuracy,
      }, {
        priority: SIGNAL_PRIORITIES.LOW,
      });

      this.selfState.nudge('curiosity', 0.03);
      this.debugInfo = `ToM: "${result.thinking.slice(0, 30)}..." (acc:${(this.predictionAccuracy * 100).toFixed(0)}%)`;
    } catch (err) {
      this.debugInfo = `ToM error: ${err}`;
    }

    this.status = 'idle';
  }
}
