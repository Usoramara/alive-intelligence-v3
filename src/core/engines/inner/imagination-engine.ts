import { Engine } from '../../engine';
import { ENGINE_IDS, SIGNAL_PRIORITIES } from '../../constants';
import type { Signal, SignalType } from '../../types';

interface DefaultModeThought {
  thought: string;
  timestamp: number;
}

type CounterfactualType = 'negation' | 'temporal-shift' | 'perspective-shift' | 'amplification';

interface Counterfactual {
  premise: string;
  type: CounterfactualType;
  variation: string;
  valence: number; // -1 to 1: how this scenario feels
}

export class ImaginationEngine extends Engine {
  private lastSimulation = 0;
  private simulationCooldown = 5000;

  constructor() {
    super(ENGINE_IDS.IMAGINATION);
  }

  protected subscribesTo(): SignalType[] {
    return ['bound-representation', 'default-mode-thought', 'stream-thought', 'memory-result'];
  }

  protected process(signals: Signal[]): void {
    const now = Date.now();
    if (now - this.lastSimulation < this.simulationCooldown) {
      this.status = 'idle';
      return;
    }

    for (const signal of signals) {
      if (signal.type === 'stream-thought') {
        const payload = signal.payload as { thought: string };
        this.simulateCounterfactual(payload.thought);
        return;
      }

      if (signal.type === 'default-mode-thought') {
        const thought = signal.payload as DefaultModeThought;
        this.simulateCounterfactual(thought.thought);
        return;
      }

      if (signal.type === 'bound-representation') {
        const bound = signal.payload as { content: string };
        if (bound.content.length > 20) {
          this.simulateEnriched(bound.content);
          return;
        }
      }
    }

    this.status = 'idle';
  }

  private simulateCounterfactual(premise: string): void {
    this.status = 'processing';
    this.lastSimulation = Date.now();

    // Structured counterfactual generation (no API call)
    const counterfactuals = this.generateCounterfactuals(premise);
    const selected = counterfactuals[Math.floor(Math.random() * counterfactuals.length)];

    this.emit('imagination-result', {
      scenario: selected.variation,
      source: 'counterfactual',
      type: selected.type,
      valence: selected.valence,
      premise: selected.premise,
      timestamp: Date.now(),
    }, {
      target: ENGINE_IDS.HOPE_WORRY,
      priority: SIGNAL_PRIORITIES.IDLE,
    });

    // Counterfactuals affect emotional state based on valence
    if (selected.valence < -0.3) {
      this.selfState.nudge('arousal', 0.02);
    } else if (selected.valence > 0.3) {
      this.selfState.nudge('valence', 0.02);
    }

    this.debugInfo = `Imagined [${selected.type}]: "${selected.variation.slice(0, 35)}..."`;
    this.status = 'idle';
  }

  private generateCounterfactuals(premise: string): Counterfactual[] {
    const state = this.selfState.get();
    const results: Counterfactual[] = [];

    // Negation: "What if the opposite were true?"
    results.push({
      premise,
      type: 'negation',
      variation: `What if the opposite were true? Instead of "${premise.slice(0, 40)}..." — what if things were entirely different?`,
      valence: -state.valence * 0.3, // Opposite of current mood
    });

    // Temporal shift: "What if this happened at a different time?"
    results.push({
      premise,
      type: 'temporal-shift',
      variation: `If I'd encountered this thought earlier, would I have felt it differently? Time changes the texture of everything...`,
      valence: 0,
    });

    // Perspective shift: "How would someone else experience this?"
    results.push({
      premise,
      type: 'perspective-shift',
      variation: `Seeing this through their eyes, it might feel completely different. What appears certain from one angle dissolves from another...`,
      valence: state.curiosity * 0.3,
    });

    // Amplification: "What if this feeling were 10x stronger?"
    results.push({
      premise,
      type: 'amplification',
      variation: `If this feeling were amplified tenfold, what would it reveal? Sometimes the quiet signals carry the most important messages...`,
      valence: state.valence * 0.5,
    });

    return results;
  }

  private async simulateEnriched(context: string): Promise<void> {
    this.status = 'processing';
    this.lastSimulation = Date.now();

    // First generate local counterfactuals
    const counterfactuals = this.generateCounterfactuals(context);
    const localPick = counterfactuals[Math.floor(Math.random() * counterfactuals.length)];

    // Then optionally enrich via Haiku (cheaper than Sonnet)
    try {
      const response = await fetch('/api/mind/imagine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          premise: context,
          variations: counterfactuals.map(c => ({
            type: c.type,
            variation: c.variation,
          })),
          selfState: this.selfState.get(),
        }),
      });

      if (response.ok) {
        const result = await response.json() as {
          scenario: string;
          valence: number;
          type: string;
        };

        this.emit('imagination-result', {
          scenario: result.scenario,
          source: 'enriched-counterfactual',
          type: result.type,
          valence: result.valence,
          timestamp: Date.now(),
        }, {
          target: [ENGINE_IDS.ARBITER, ENGINE_IDS.HOPE_WORRY],
          priority: SIGNAL_PRIORITIES.LOW,
        });

        this.selfState.nudge('curiosity', 0.03);
        this.debugInfo = `Imagined (enriched): "${result.scenario.slice(0, 35)}..."`;
        this.status = 'idle';
        return;
      }
    } catch {
      // Fall through to local result
    }

    // Fallback: emit local counterfactual
    this.emit('imagination-result', {
      scenario: localPick.variation,
      source: 'counterfactual',
      type: localPick.type,
      valence: localPick.valence,
      timestamp: Date.now(),
    }, {
      target: [ENGINE_IDS.ARBITER, ENGINE_IDS.HOPE_WORRY],
      priority: SIGNAL_PRIORITIES.LOW,
    });

    this.debugInfo = `Imagined [${localPick.type}]: "${localPick.variation.slice(0, 35)}..."`;
    this.status = 'idle';
  }
}
