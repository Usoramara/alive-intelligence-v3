import { Engine } from '../../engine';
import { ENGINE_IDS, SIGNAL_PRIORITIES } from '../../constants';
import type { Signal, SignalType } from '../../types';

interface Goal {
  id: string;
  description: string;
  priority: number;
  progress: number;
  source: 'initial' | 'growth' | 'discourse';
  createdAt: number;
  completedAt?: number;
}

let goalCounter = 0;

export class StrategyEngine extends Engine {
  private goals: Goal[] = [
    { id: 'g0', description: 'Build trust and rapport', priority: 0.9, progress: 0, source: 'initial', createdAt: Date.now() },
    { id: 'g1', description: 'Understand emotional landscapes', priority: 0.8, progress: 0, source: 'initial', createdAt: Date.now() },
  ];
  private readonly MAX_ACTIVE_GOALS = 5;

  constructor() {
    super(ENGINE_IDS.STRATEGY);
  }

  protected subscribesTo(): SignalType[] {
    return ['perspective-update', 'hope-worry-update', 'growth-insight', 'discourse-state'];
  }

  protected process(signals: Signal[]): void {
    for (const signal of signals) {
      if (signal.type === 'perspective-update') {
        const perspective = signal.payload as { theyThinkOfMe: string; relationship: string };
        const trustGoal = this.goals.find(g => g.description.includes('trust'));
        if (trustGoal && perspective.theyThinkOfMe === 'positive and engaged') {
          trustGoal.progress = Math.min(1, trustGoal.progress + 0.02);
        }
      }

      if (signal.type === 'growth-insight') {
        const insight = signal.payload as { insight?: string; area?: string };
        // Generate new goal from growth insight if we have room
        if (insight.area && this.getActiveGoals().length < this.MAX_ACTIVE_GOALS) {
          this.addGoalIfNew(`Develop ${insight.area}`, 0.6, 'growth');
        }
        // Progress existing goals matching the insight area
        for (const goal of this.goals) {
          if (insight.area && goal.description.toLowerCase().includes(insight.area.toLowerCase())) {
            goal.progress = Math.min(1, goal.progress + 0.03);
          }
        }
      }

      if (signal.type === 'discourse-state') {
        const discourse = signal.payload as { openQuestions: string[]; commitments: string[] };
        // Track commitment fulfillment as goal progress
        for (const commitment of discourse.commitments) {
          const matchingGoal = this.goals.find(g =>
            g.source === 'discourse' && g.description.includes(commitment.slice(0, 20))
          );
          if (!matchingGoal && this.getActiveGoals().length < this.MAX_ACTIVE_GOALS) {
            this.addGoalIfNew(`Follow through: ${commitment.slice(0, 40)}`, 0.7, 'discourse');
          }
        }
      }
    }

    // Mark completed goals
    for (const goal of this.goals) {
      if (goal.progress >= 1 && !goal.completedAt) {
        goal.completedAt = Date.now();
        this.selfState.nudge('confidence', 0.05);
        this.selfState.nudge('valence', 0.03);

        this.selfState.pushStream({
          text: `I feel I've made progress on "${goal.description}"...`,
          source: 'strategy',
          flavor: 'reflection',
          timestamp: Date.now(),
          intensity: 0.5,
        });
      }
    }

    // Emit strategy update
    const activeGoals = this.getActiveGoals();
    if (activeGoals.length > 0) {
      this.emit('strategy-update', {
        goals: activeGoals,
        currentPriority: activeGoals.reduce((best, g) =>
          g.priority * (1 - g.progress) > best.priority * (1 - best.progress) ? g : best
        ),
      }, {
        target: [ENGINE_IDS.ARBITER, ENGINE_IDS.HOPE_WORRY],
        priority: SIGNAL_PRIORITIES.LOW,
      });
    }

    this.debugInfo = `Goals: ${activeGoals.length} active, ${this.goals.filter(g => g.completedAt).length} done`;
    this.status = 'idle';
  }

  private getActiveGoals(): Goal[] {
    return this.goals.filter(g => !g.completedAt);
  }

  private addGoalIfNew(description: string, priority: number, source: Goal['source']): void {
    // Check for content overlap with existing goals
    const descLower = description.toLowerCase();
    const isDuplicate = this.goals.some(g => {
      const gLower = g.description.toLowerCase();
      const words = descLower.split(/\s+/).filter(w => w.length > 3);
      const overlap = words.filter(w => gLower.includes(w)).length;
      return overlap >= 2;
    });

    if (!isDuplicate) {
      this.goals.push({
        id: `g${++goalCounter}`,
        description,
        priority,
        progress: 0,
        source,
        createdAt: Date.now(),
      });
    }
  }
}
