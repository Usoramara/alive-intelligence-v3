import { isSignal } from './types';
import type { Signal, SignalType } from './types';
import type { SignalBus } from './signal-bus';
import { ENGINE_IDS, SIGNAL_PRIORITIES } from './constants';
import type { BodyManifest, TaskUpdateEvent } from './hal/types';

let activeInstance: BodyBridge | null = null;

/**
 * Bridges the client-side signal bus with the server-side Body HAL.
 * Pattern mirrors ThoughtBridge:
 * - Subscribes to body-intent signals on the bus
 * - POSTs to /api/body/execute with the intent payload
 * - Polls /api/body/tasks for status updates
 * - Injects body-feedback and body-task-update signals back onto the bus
 * - Fetches manifest on startup, re-fetches on body-status change
 */
export class BodyBridge {
  private bus: SignalBus;
  private intentSubscriptionId: string;
  private statusSubscriptionId: string;
  private manifest: BodyManifest | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private activeTasks = new Set<string>();

  constructor(bus: SignalBus) {
    // Destroy previous instance if exists (HMR/StrictMode safety)
    if (activeInstance) {
      activeInstance.destroy();
    }
    activeInstance = this;

    this.bus = bus;

    // Subscribe to body-intent signals
    this.intentSubscriptionId = bus.subscribe(
      ENGINE_IDS.BODY_GATEWAY,
      ['body-intent'] as SignalType[],
      (signal) => this.handleIntent(signal),
    );

    // Subscribe to body-status signals for manifest refresh
    this.statusSubscriptionId = bus.subscribe(
      ENGINE_IDS.BODY_GATEWAY,
      ['body-status'] as SignalType[],
      () => this.fetchManifest(),
    );

    // Fetch manifest on startup
    this.fetchManifest();

    // Start polling for task updates
    this.pollInterval = setInterval(() => this.pollTasks(), 2000);
  }

  private async fetchManifest(): Promise<void> {
    try {
      const response = await fetch('/api/body/manifest');
      if (!response.ok) return;

      this.manifest = await response.json();

      // Inject manifest signal onto the bus
      this.bus.emit({
        type: 'body-manifest',
        source: ENGINE_IDS.BODY_GATEWAY,
        payload: this.manifest!,
        priority: SIGNAL_PRIORITIES.MEDIUM,
      });
    } catch (e) {
      console.error('[BodyBridge] Failed to fetch manifest:', e);
    }
  }

  private async handleIntent(signal: Signal): Promise<void> {
    if (!isSignal(signal, 'body-intent')) return;

    const intent = signal.payload;

    try {
      const response = await fetch('/api/body/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        this.bus.emit({
          type: 'body-feedback',
          source: ENGINE_IDS.BODY_GATEWAY,
          payload: {
            taskId: '',
            status: 'failed' as const,
            error: error.error ?? `HTTP ${response.status}`,
          },
          priority: SIGNAL_PRIORITIES.MEDIUM,
        });
        return;
      }

      const result = await response.json();

      if (result.error) {
        this.bus.emit({
          type: 'body-feedback',
          source: ENGINE_IDS.BODY_GATEWAY,
          payload: {
            taskId: result.taskId ?? '',
            status: 'failed' as const,
            error: result.error,
          },
          priority: SIGNAL_PRIORITIES.MEDIUM,
        });
      } else if (result.taskId) {
        this.activeTasks.add(result.taskId);
      }
    } catch (e) {
      console.error('[BodyBridge] Failed to execute intent:', e);
      this.bus.emit({
        type: 'body-feedback',
        source: ENGINE_IDS.BODY_GATEWAY,
        payload: {
          taskId: '',
          status: 'failed' as const,
          error: String(e),
        },
        priority: SIGNAL_PRIORITIES.MEDIUM,
      });
    }
  }

  private async pollTasks(): Promise<void> {
    if (this.activeTasks.size === 0) return;

    try {
      const response = await fetch('/api/body/tasks');
      if (!response.ok) return;

      const { tasks } = await response.json();

      for (const task of tasks) {
        if (!this.activeTasks.has(task.id)) continue;

        const update: TaskUpdateEvent = {
          taskId: task.id,
          status: task.status,
          progress: task.stepCount > 0 ? task.completedSteps / task.stepCount : 0,
          error: task.error,
        };

        this.bus.emit({
          type: 'body-task-update',
          source: ENGINE_IDS.BODY_GATEWAY,
          payload: update,
          priority: SIGNAL_PRIORITIES.MEDIUM,
        });

        // If task is terminal, emit final feedback and stop tracking
        if (task.status === 'completed' || task.status === 'failed' || task.status === 'aborted') {
          this.bus.emit({
            type: 'body-feedback',
            source: ENGINE_IDS.BODY_GATEWAY,
            payload: {
              taskId: task.id,
              status: task.status,
              error: task.error,
            },
            priority: SIGNAL_PRIORITIES.MEDIUM,
          });

          this.activeTasks.delete(task.id);
        }
      }
    } catch {
      // Network errors are non-fatal — will retry on next poll
    }
  }

  getManifest(): BodyManifest | null {
    return this.manifest;
  }

  destroy(): void {
    this.bus.unsubscribe(this.intentSubscriptionId);
    this.bus.unsubscribe(this.statusSubscriptionId);
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.activeTasks.clear();
    if (activeInstance === this) {
      activeInstance = null;
    }
  }
}
