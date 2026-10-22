import BackgroundTasks, {
  type BackgroundTaskStatus as Status,
} from '../../native/modules/background-tasks/background-tasks';

/** Whether the OS lets this app run in the background: the user or a policy can turn it off. */
export type BackgroundTaskStatus = Status;

export type BackgroundTaskOptions = {
  /** Minutes between runs, at least 15 (Android's floor). The OS may wait longer. Defaults to 15. */
  minimumInterval?: number;
  /** Run only with a network connection. */
  requiresNetwork?: boolean;
  /** Run only while charging. On iOS this makes it a processing task (docs/background-tasks.md). */
  requiresCharging?: boolean;
};

/** What a task receives when the OS runs it. */
export type BackgroundTaskRun = {
  name: string;
  /** When the OS stops the run, in milliseconds since the epoch. Finish before it. */
  deadline: number;
};

/** Resolve when the work is done; throw or reject to report a failed run. */
export type BackgroundTask = (run: BackgroundTaskRun) => Promise<void> | void;

/** Android's JobScheduler runs periodic jobs at most every 15 minutes; iOS takes the same floor. */
const MINIMUM_INTERVAL = 15;

// JavaScript the OS runs while the app is in the background or not running
// (docs/background-tasks.md). Each name is declared in `backgroundTasks` in
// kuito.config.ts.

/**
 * The task the OS runs under `name`. Call it at module scope: a background
 * launch evaluates the app's modules without mounting its UI, and only tasks
 * defined then can run.
 */
export function define(name: string, task: BackgroundTask): void {
  if (!globalThis.__kuito) throw new Error('backgroundTasks.define requires the Kuito runtime');

  globalThis.__kuito.defineBackgroundTask(name, task, {
    finish: BackgroundTasks.finish,
    run: BackgroundTasks.run,
  });
}

/** Asks the OS to run the task about every `minimumInterval` minutes, across restarts. */
export function schedule(name: string, options: BackgroundTaskOptions = {}): Promise<void> {
  const {
    minimumInterval = MINIMUM_INTERVAL,
    requiresNetwork = false,
    requiresCharging = false,
  } = options;

  if (!(minimumInterval >= MINIMUM_INTERVAL))
    return Promise.reject(
      new RangeError(
        `backgroundTasks.schedule('${name}'): minimumInterval must be at least ${MINIMUM_INTERVAL} minutes, not ${minimumInterval}`,
      ),
    );

  return BackgroundTasks.register(name, { minimumInterval, requiresNetwork, requiresCharging });
}

/** Stops the OS from running the task. */
export const cancel = BackgroundTasks.unregister;

/** Whether the OS lets this app run in the background. */
export const status = BackgroundTasks.status;
