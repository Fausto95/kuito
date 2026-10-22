// Background tasks (docs/background-tasks.md): JS the OS runs while the app is
// in the background or not running. The platform's BackgroundTasks module
// emits `run` once the kernel listens, and waits for `finish` to tell the OS
// how the run went. Definitions live here, not in app code, so a Live Patch
// that defines a task again replaces it instead of adding a second listener.
// The module's linked functions come from app code (src/native/background-tasks.ts),
// which the compiler numbers; the kernel can't name them itself.
import { reportError } from './errors';
import { host } from './host';
import { backgroundTasks, type BackgroundTasksPlatform } from './state/system';
import { describeValue, isFunction, isPlainData } from './values';

function platform(): BackgroundTasksPlatform {
  if (!backgroundTasks.platform) throw new Error('No background task is defined');

  return backgroundTasks.platform;
}

/** A background launch: the app's modules run so they define their tasks; its UI does not mount. */
export function isHeadless(): boolean {
  return host.__kuitoHostHeadless === true;
}

function finish(id: string, succeeded: boolean): void {
  platform()
    .finish(id, succeeded)
    .catch((error: unknown) => reportError('Background task run ' + id + ' did not finish', error));
}

function run(payload: unknown): void {
  if (
    !isPlainData(payload) ||
    typeof payload.id !== 'string' ||
    typeof payload.name !== 'string' ||
    typeof payload.deadline !== 'number'
  ) {
    reportError('Invalid background task run', describeValue(payload));

    return;
  }

  const { id, name, deadline, data } = payload;
  const task = backgroundTasks.definitions[name];

  if (!task) {
    reportError(
      'Background task failed',
      new Error(
        "No background task named '" +
          name +
          "'. Call backgroundTasks.define('" +
          name +
          "', task) at module scope, so a background launch defines it before the run.",
      ),
    );

    finish(id, false);

    return;
  }

  // A run the platform starts for a source of its own (a location task's fixes) carries them as `data`.
  const received = data === undefined ? { name, deadline } : { name, deadline, data };

  new Promise((resolve) => resolve(task(received))).then(
    () => finish(id, true),
    (error: unknown) => {
      reportError("Background task '" + name + "' failed", error);
      finish(id, false);
    },
  );
}

function isPlatform(value: unknown): value is BackgroundTasksPlatform {
  return (
    isPlainData(value) &&
    isFunction(value.finish) &&
    isPlainData(value.run) &&
    isFunction(value.run.addListener)
  );
}

/**
 * Defines (or replaces) the task the OS runs under `name`; `module` holds
 * the BackgroundTasks module's `finish` and `run`, as app code links them.
 */
export function defineBackgroundTask(name: unknown, task: unknown, module: unknown): void {
  if (typeof name !== 'string' || !name) throw new TypeError('A background task needs a name');

  if (!isFunction(task))
    throw new TypeError(
      "Background task '" + name + "' must be a function, not " + describeValue(task),
    );

  if (!isPlatform(module))
    throw new TypeError(
      'defineBackgroundTask needs the BackgroundTasks module, not ' + describeValue(module),
    );

  backgroundTasks.definitions[name] = task;
  backgroundTasks.platform = module;

  if (backgroundTasks.listening) return;

  // Listening is what tells the platform this runtime can take runs.
  module.run.addListener(run);
  backgroundTasks.listening = true;
}
