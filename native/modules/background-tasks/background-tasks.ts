import { defineModule, event, fn } from '../../../src/native/define-module';
import type { Json } from '../../../src/native/modules';

/** Whether the OS lets this app run in the background: the user or a policy can turn it off. */
export type BackgroundTaskStatus = 'available' | 'denied' | 'restricted';

/** How often, and under which conditions, the OS runs a task. */
export type BackgroundTaskSchedule = {
  /** Minutes, at least 15: src/native/background-tasks.ts checks it. */
  minimumInterval: number;
  requiresNetwork: boolean;
  requiresCharging: boolean;
};

/** A run the OS started, which JavaScript ends with `finish(id, succeeded)`. */
export type BackgroundTaskDelivery = {
  id: string;
  name: string;
  /** When the OS stops the run, in milliseconds since the epoch. */
  deadline: number;
  /** What a source of the app's own sends with the run: a location task's fixes. */
  data?: Json;
};

// JavaScript the OS runs while the app is in the background or not running
// (docs/background-tasks.md). The kernel's half, src/runtime/background-tasks.ts,
// listens for `run` and calls `finish`. A run that arrives with no runtime
// listening starts a headless one, which the module's launch sets up.
export default defineModule('BackgroundTasks', {
  register: fn.main<(name: string, schedule: BackgroundTaskSchedule) => Promise<void>>(),
  unregister: fn.main<(name: string) => Promise<void>>(),
  status: fn.main<() => Promise<BackgroundTaskStatus>>(),
  /** Ends a run and tells the OS how it went. */
  finish: fn.main<(id: string, succeeded: boolean) => Promise<void>>(),
  /** Listening means this runtime can take runs; the kernel listens once a task is defined. */
  run: event<BackgroundTaskDelivery>(),
  // BGTaskScheduler takes handlers only before launch ends; Android's runs need the headless runtime.
  ios: { class: 'KuitoBackgroundTasksModule', launch: true },
  android: {
    class: 'dev.kuito.runtime.modules.backgroundtasks.KuitoBackgroundTasksModule',
    launch: true,
  },
});
