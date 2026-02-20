import { Engine } from '../../engine';
import { ENGINE_IDS, SIGNAL_PRIORITIES } from '../../constants';
import { isSignal } from '../../types';
import type { Signal, SignalType } from '../../types';
import type { BodyIntent } from '../../hal/types';

export class MotorEngine extends Engine {
  constructor() {
    super(ENGINE_IDS.MOTOR);
  }

  protected subscribesTo(): SignalType[] {
    return ['action-decision', 'safety-alert', 'motor-command'];
  }

  protected process(signals: Signal[]): void {
    for (const signal of signals) {
      if (isSignal(signal, 'safety-alert')) {
        // Safety override — halt all motor actions
        this.emit('locomotion-update', { action: 'halt', reason: 'safety' }, {
          target: ENGINE_IDS.LOCOMOTION,
          priority: SIGNAL_PRIORITIES.CRITICAL,
        });
        this.debugInfo = 'Motor halted (safety)';
      } else if (isSignal(signal, 'motor-command')) {
        const cmd = signal.payload;

        // Forward to locomotion for backward compatibility
        this.emit('locomotion-update', cmd, {
          target: ENGINE_IDS.LOCOMOTION,
          priority: SIGNAL_PRIORITIES.MEDIUM,
        });

        // Also emit body-intent for the Body Gateway
        this.emit('body-intent', {
          type: 'gesture',
          gesture: cmd.action,
        } satisfies BodyIntent, {
          target: ENGINE_IDS.BODY_GATEWAY,
          priority: SIGNAL_PRIORITIES.MEDIUM,
        });

        this.debugInfo = `Motor: ${cmd.action}`;
      }
    }
    this.status = 'idle';
  }
}
