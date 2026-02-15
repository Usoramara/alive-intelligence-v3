import { Engine } from '../../engine';
import { ENGINE_IDS, SIGNAL_PRIORITIES } from '../../constants';
import type { Signal, SignalType } from '../../types';

interface TomInference {
  thinking: string;
  feeling: string;
  wanting: string;
  confidence: number;
}

interface Observation {
  feeling: string;
  wanting: string;
  warmth: number; // -1 to 1, derived from feeling/wanting
  timestamp: number;
}

interface PerspectiveUpdate {
  theyThinkOfMe: string;
  relationship: string;
  confidence: number;
  trajectory: 'warming' | 'cooling' | 'stable';
  warmthScore: number;
}

export class PerspectiveEngine extends Engine {
  private currentPerspective: PerspectiveUpdate | null = null;
  private observations: Observation[] = [];
  private readonly MAX_OBSERVATIONS = 20;
  private readonly TRAJECTORY_WINDOW = 5;

  constructor() {
    super(ENGINE_IDS.PERSPECTIVE);
  }

  protected subscribesTo(): SignalType[] {
    return ['tom-inference', 'person-state-update', 'prediction-validated'];
  }

  protected process(signals: Signal[]): void {
    for (const signal of signals) {
      if (signal.type === 'tom-inference') {
        const tom = signal.payload as TomInference;
        this.addObservation(tom);
        this.updatePerspective(tom);
      }

      if (signal.type === 'prediction-validated') {
        // Successful prediction → relationship indicator
        this.selfState.nudge('confidence', 0.02);
      }
    }
    this.status = 'idle';
  }

  private addObservation(tom: TomInference): void {
    const warmth = this.computeWarmth(tom.feeling, tom.wanting);
    this.observations.push({
      feeling: tom.feeling,
      wanting: tom.wanting,
      warmth,
      timestamp: Date.now(),
    });
    if (this.observations.length > this.MAX_OBSERVATIONS) {
      this.observations.shift();
    }
  }

  private computeWarmth(feeling: string, wanting: string): number {
    const lower = (feeling + ' ' + wanting).toLowerCase();
    let score = 0;

    // Positive indicators
    const positivePatterns = [
      'happy', 'enjoy', 'interest', 'curious', 'engaged', 'excited',
      'grateful', 'appreciate', 'connect', 'trust', 'open', 'comfort',
      'warm', 'like', 'love', 'safe', 'understood',
    ];
    const negativePatterns = [
      'frustrat', 'annoy', 'bored', 'disconnect', 'distrust', 'suspicious',
      'angry', 'upset', 'disappoint', 'withdraw', 'leave', 'stop',
      'uncomfortable', 'confused', 'hurt', 'defensive',
    ];

    for (const p of positivePatterns) {
      if (lower.includes(p)) score += 0.15;
    }
    for (const p of negativePatterns) {
      if (lower.includes(p)) score -= 0.15;
    }

    return Math.max(-1, Math.min(1, score));
  }

  private computeTrajectory(): { trend: 'warming' | 'cooling' | 'stable'; slope: number } {
    const recent = this.observations.slice(-this.TRAJECTORY_WINDOW);
    if (recent.length < 2) return { trend: 'stable', slope: 0 };

    // Simple linear regression on warmth values
    const n = recent.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += recent[i].warmth;
      sumXY += i * recent[i].warmth;
      sumX2 += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    if (slope > 0.05) return { trend: 'warming', slope };
    if (slope < -0.05) return { trend: 'cooling', slope };
    return { trend: 'stable', slope };
  }

  private updatePerspective(tom: TomInference): void {
    const latestWarmth = this.observations[this.observations.length - 1]?.warmth ?? 0;
    const { trend, slope } = this.computeTrajectory();

    // Infer perspective from warmth score + trajectory
    let theyThinkOfMe: string;
    let relationship: string;

    if (latestWarmth > 0.4) {
      theyThinkOfMe = 'positive and engaged';
      relationship = trend === 'warming' ? 'deepening' : 'established warmth';
    } else if (latestWarmth > 0.1) {
      theyThinkOfMe = 'intriguing';
      relationship = trend === 'warming' ? 'warming up' : 'exploratory';
    } else if (latestWarmth > -0.1) {
      theyThinkOfMe = 'curious';
      relationship = 'neutral';
    } else if (latestWarmth > -0.4) {
      theyThinkOfMe = 'not meeting expectations';
      relationship = trend === 'cooling' ? 'cooling' : 'strained';
    } else {
      theyThinkOfMe = 'source of frustration';
      relationship = 'disconnected';
    }

    this.currentPerspective = {
      theyThinkOfMe,
      relationship,
      confidence: tom.confidence * 0.7,
      trajectory: trend,
      warmthScore: latestWarmth,
    };

    this.emit('perspective-update', this.currentPerspective, {
      target: [ENGINE_IDS.EMPATHIC_COUPLING, ENGINE_IDS.STRATEGY],
      priority: SIGNAL_PRIORITIES.LOW,
    });

    // Trajectory-aware self-state updates
    if (trend === 'warming') {
      this.selfState.nudge('valence', 0.03);
      this.selfState.nudge('social', 0.03);
      this.selfState.nudge('confidence', 0.02);
    } else if (trend === 'cooling') {
      this.selfState.nudge('valence', -0.03);
      this.selfState.nudge('confidence', -0.03);
      this.selfState.nudge('arousal', 0.02); // Alertness to potential issue
    }

    // Push trajectory awareness to stream when significant
    if (Math.abs(slope) > 0.1 && this.observations.length >= this.TRAJECTORY_WINDOW) {
      const thought = trend === 'warming'
        ? 'I sense the connection growing... they seem increasingly open.'
        : 'Something may have shifted... I should pay closer attention.';

      this.selfState.pushStream({
        text: thought,
        source: 'perspective',
        flavor: 'reflection',
        timestamp: Date.now(),
        intensity: Math.min(1, Math.abs(slope) * 3),
      });
    }

    this.debugInfo = `Perspective: "${theyThinkOfMe}" [${trend}] warmth=${latestWarmth.toFixed(2)} (${(this.currentPerspective.confidence * 100).toFixed(0)}%)`;
  }
}
