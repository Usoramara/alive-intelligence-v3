import { Engine } from '../../engine';
import { ENGINE_IDS, SIGNAL_PRIORITIES } from '../../constants';
import { isSignal } from '../../types';
import type { Signal, SignalType, SelfState, BoundRepresentation, ResponseStyle, ActionDecision } from '../../types';
import type { BodyManifest, TaskStatus } from '../../hal/types';

export class ArbiterEngine extends Engine {
  private pendingDecisions: BoundRepresentation[] = [];
  private lastResponseTime = 0;
  private waitingForClaude = false;

  // Stored context from other engines
  private latestTomInference?: { theyFeel: string; theyWant: string; theyBelieve: string };
  private latestDetectedEmotions?: { emotions: string[]; valence: number; arousal: number; confidence: number };
  private latestMemoryResults: string[] = [];
  private latestEmpathicState?: { mirroring: string; coupling: number; resonance: string };
  private latestStrategicPriority?: { description: string; priority: number; progress: number };
  private latestWorkingMemory?: { summary: string; items: unknown[] };
  private latestDiscourse?: { currentTopic: string | null; openQuestions: string[]; commitments: string[] };
  private latestMetacognition?: { uncertainty: number; processingLoad: number; emotionalRegulation: string | null; coherence: number };
  private latestResourceBudget?: { sonnetRemaining: number; suggestedMaxTokens: number; useLite: boolean };

  // Body HAL context
  private bodyManifest: BodyManifest | null = null;
  private lastBodyFeedback: { status: TaskStatus; error?: string } | null = null;

  // Energy recovery tracking
  private energyDeferralCount = 0;

  constructor() {
    super(ENGINE_IDS.ARBITER);
  }

  protected subscribesTo(): SignalType[] {
    return [
      'bound-representation',
      'claude-response',
      'value-violation',
      'safety-alert',
      'empathic-state',
      'hope-worry-update',
      'tom-inference',
      'emotion-detected',
      'memory-result',
      'strategy-update',
      'working-memory-update',
      'discourse-state',
      'metacognition-update',
      'resource-budget',
      'body-feedback',
      'body-manifest',
    ];
  }

  protected process(signals: Signal[]): void {
    for (const signal of signals) {
      if (isSignal(signal, 'bound-representation')) {
        this.pendingDecisions.push(signal.payload);
      } else if (isSignal(signal, 'claude-response')) {
        this.waitingForClaude = false;
        this.pendingDecisions = [];
        this.energyDeferralCount = 0; // Reset deferral count on successful response
        const response = signal.payload;

        // Apply emotion shift from Claude's reasoning
        if (response.emotionShift) {
          this.selfState.applyShift(response.emotionShift);
        }

        // Output the response
        this.emit('voice-output', {
          text: response.text,
          timestamp: Date.now(),
        }, {
          target: ENGINE_IDS.VOICE,
          priority: SIGNAL_PRIORITIES.HIGH,
        });

        // Notify expression engine
        this.emit('expression-update', {
          speaking: true,
          text: response.text,
        }, {
          target: ENGINE_IDS.EXPRESSION,
          priority: SIGNAL_PRIORITIES.MEDIUM,
        });

        // Score for memory write
        this.emit('memory-significance', {
          content: response.text,
          type: 'response',
          significance: 0.6,
        }, {
          target: ENGINE_IDS.MEMORY_WRITE,
          priority: SIGNAL_PRIORITIES.LOW,
        });

        this.debugInfo = `Response: "${response.text.slice(0, 30)}..."`;
        this.lastResponseTime = Date.now();
      } else if (isSignal(signal, 'value-violation')) {
        this.pendingDecisions = [];
        this.debugInfo = 'Value violation — suppressed';
      } else if (isSignal(signal, 'safety-alert')) {
        this.pendingDecisions = [];
        this.waitingForClaude = false;
        this.debugInfo = 'Safety override';
      } else if (isSignal(signal, 'tom-inference')) {
        this.latestTomInference = signal.payload;
      } else if (isSignal(signal, 'emotion-detected')) {
        this.latestDetectedEmotions = signal.payload;
      } else if (isSignal(signal, 'memory-result')) {
        this.latestMemoryResults = signal.payload.items ?? [];
      } else if (isSignal(signal, 'empathic-state')) {
        this.latestEmpathicState = signal.payload;
      } else if (isSignal(signal, 'strategy-update')) {
        this.latestStrategicPriority = signal.payload.currentPriority;
      } else if (isSignal(signal, 'working-memory-update')) {
        this.latestWorkingMemory = signal.payload;
      } else if (isSignal(signal, 'discourse-state')) {
        this.latestDiscourse = signal.payload;
      } else if (isSignal(signal, 'metacognition-update')) {
        this.latestMetacognition = signal.payload;
      } else if (isSignal(signal, 'resource-budget')) {
        this.latestResourceBudget = signal.payload;
      } else if (isSignal(signal, 'body-manifest')) {
        this.bodyManifest = signal.payload;
      } else if (isSignal(signal, 'body-feedback')) {
        this.lastBodyFeedback = {
          status: signal.payload.status,
          error: signal.payload.error,
        };
      }
    }

    // Process pending decisions
    if (this.pendingDecisions.length > 0 && !this.waitingForClaude) {
      const decision = this.pendingDecisions.shift()!;
      this.pendingDecisions = [];

      if (decision.needsClaude) {
        const selfState = this.selfState.get();

        // Energy-gated response: when energy < 0.1 and not urgent, defer
        const isUrgent = /\b(help|emergency|urgent|please|now)\b/i.test(decision.content);
        if (selfState.energy < 0.1 && !isUrgent && this.energyDeferralCount < 3) {
          this.energyDeferralCount++;
          this.selfState.nudge('energy', 0.01); // Passive recovery
          this.debugInfo = 'Low energy — deferring response';
          this.status = 'idle';
          return;
        }

        this.waitingForClaude = true;
        this.status = 'waiting';

        // Store user input to memory
        const hasEmotionalContent = /\b(died|dead|death|grief|loss|lost|sad|cry|happy|love|angry|afraid|scared|hurt|pain|miss|passed away|funeral|mourn)\b/i.test(decision.content);
        this.emit('memory-significance', {
          content: decision.content,
          type: 'user-input',
          significance: hasEmotionalContent ? 0.7 : 0.4,
        }, {
          target: ENGINE_IDS.MEMORY_WRITE,
          priority: SIGNAL_PRIORITIES.LOW,
        });

        // Gather recent inner thoughts from consciousness stream
        const stream = this.selfState.getStream();
        const recentInnerThoughts = stream.length > 0
          ? stream.slice(-5).map(e => `[${e.flavor}] ${e.text}`)
          : undefined;

        // Compute energy/arousal-modulated response style
        const responseStyle = this.computeResponseStyle(selfState);

        // Apply resource budget adjustments
        if (this.latestResourceBudget) {
          responseStyle.maxTokens = Math.min(responseStyle.maxTokens, this.latestResourceBudget.suggestedMaxTokens);
        }
        const useLite = this.latestResourceBudget?.useLite ?? false;

        // Build body awareness context for Claude
        const bodyContext = this.buildBodyContext();

        // Inject body context into decision context
        const enrichedContext = bodyContext
          ? [...decision.context, bodyContext]
          : decision.context;

        // Request Claude thinking via server — pack in enriched context
        const actionDecision: ActionDecision = {
          action: 'respond',
          content: decision.content,
          context: enrichedContext,
          selfState: decision.selfState,
          timestamp: Date.now(),
          empathicState: this.latestEmpathicState,
          tomInference: this.latestTomInference,
          recentMemories: this.latestMemoryResults.length > 0 ? this.latestMemoryResults : undefined,
          detectedEmotions: this.latestDetectedEmotions,
          strategicPriority: this.latestStrategicPriority,
          recentInnerThoughts,
          responseStyle,
          workingMemorySummary: this.latestWorkingMemory?.summary,
          discourseContext: this.latestDiscourse,
          metacognitionContext: this.latestMetacognition
            ? {
                uncertainty: this.latestMetacognition.uncertainty,
                processingLoad: this.latestMetacognition.processingLoad,
                emotionalRegulation: this.latestMetacognition.emotionalRegulation,
              }
            : undefined,
          useLite,
        };

        this.emit('thought', actionDecision, {
          priority: SIGNAL_PRIORITIES.HIGH,
        });

        // Boost engagement-related states
        this.selfState.nudge('confidence', 0.02);
        this.selfState.nudge('energy', -0.01);

        this.debugInfo = `Thinking about: "${decision.content.slice(0, 25)}..."`;
      } else {
        this.status = 'idle';
        this.debugInfo = 'Observing...';
      }
    } else if (this.waitingForClaude) {
      this.status = 'waiting';
    } else {
      this.status = 'idle';
    }
  }

  private computeResponseStyle(selfState: SelfState): ResponseStyle {
    // Energy modulates response length
    let maxTokens = 300;
    if (selfState.energy < 0.3) maxTokens = 150;
    else if (selfState.energy > 0.7) maxTokens = 400;

    // Arousal modulates urgency
    let urgency: ResponseStyle['urgency'] = 'normal';
    if (selfState.arousal > 0.6) urgency = 'high';
    else if (selfState.arousal < 0.2) urgency = 'low';

    // Valence + energy modulate tone
    let tone: ResponseStyle['tone'] = 'neutral';
    if (selfState.valence > 0.3 && selfState.energy > 0.5) tone = 'energetic';
    else if (selfState.energy < 0.3 || selfState.valence < -0.2) tone = 'gentle';

    return { maxTokens, urgency, tone };
  }

  /**
   * Build a body awareness context string for Claude's system prompt.
   * This lets Claude know what physical capabilities are available.
   */
  private buildBodyContext(): string | null {
    if (!this.bodyManifest) return null;

    const caps = this.bodyManifest.capabilities;
    const canDo: string[] = [];
    const cannotDo: string[] = [];

    if (caps.locomotion && caps.locomotion.type !== 'none') {
      canDo.push(`walk (${caps.locomotion.type}, ${caps.locomotion.dof} DOF)`);
      if (caps.locomotion.presetMotions.length > 0) {
        canDo.push(`gestures: ${caps.locomotion.presetMotions.join(', ')}`);
      }
    } else {
      cannotDo.push('walk or move');
    }

    if (caps.manipulation) {
      canDo.push(`use ${caps.manipulation.arms} arm(s) to grasp objects`);
    } else {
      cannotDo.push('grasp or manipulate objects');
    }

    if (caps.speech?.tts) {
      canDo.push('speak aloud');
    }

    if (caps.expression) {
      canDo.push(`display facial expressions (${caps.expression.type})`);
    }

    for (const sys of caps.system) {
      canDo.push(`${sys.name}: ${sys.description}`);
    }

    const lines = [`[BODY] Your body: ${this.bodyManifest.displayName} (${this.bodyManifest.bodyType})`];
    if (canDo.length > 0) lines.push(`You can: ${canDo.join('; ')}.`);
    if (cannotDo.length > 0) lines.push(`You cannot: ${cannotDo.join('; ')}.`);

    if (this.bodyManifest.limits.batteryPercent !== null) {
      lines.push(`Battery: ${this.bodyManifest.limits.batteryPercent.toFixed(0)}%`);
    }

    if (this.lastBodyFeedback) {
      lines.push(`Last body action: ${this.lastBodyFeedback.status}${this.lastBodyFeedback.error ? ` (${this.lastBodyFeedback.error})` : ''}`);
    }

    return lines.join(' ');
  }
}
