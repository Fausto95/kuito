# Background tasks

`backgroundTasks` runs JavaScript while the app is in the background or not
running at all: the OS picks the moment, launches the app without UI if it has
to, and gives the task a deadline. It is a [native module](native-modules.md)
on iOS (BGTaskScheduler) and Android (JobScheduler).

```tsx
import { backgroundTasks, storage } from 'kuito';

// At module scope: a background launch runs the app's modules, not its UI.
backgroundTasks.define('sync', async ({ deadline }) => {
  const response = await fetch('https://api.example.com/feed');

  await storage.set('feed', await response.text());
});

export default function App() {
  // Once, from anywhere: the OS keeps the schedule across launches and reboots.
  void backgroundTasks.schedule('sync', { minimumInterval: 60, requiresNetwork: true });
  // …
}
```

```ts
// kuito.config.ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'Reel',
  ios: { bundleIdentifier: 'com.example.reel' },
  android: { applicationId: 'com.example.reel' },
  backgroundTasks: ['sync'],
} satisfies KuitoConfig;
```

| Function                                                                    | What it does                                                                                                                |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `define(name, task)`                                                        | The function the OS runs under `name`. Call it at module scope. Defining a name again replaces its task.                    |
| `schedule(name, { minimumInterval?, requiresNetwork?, requiresCharging? })` | Asks the OS to run the task about every `minimumInterval` minutes (at least 15, the default). Replaces an earlier schedule. |
| `cancel(name)`                                                              | Stops the OS from running it.                                                                                               |
| `status()`                                                                  | `'available'`, or `'denied'`/`'restricted'` when the user or a policy turned background work off for the app.               |

A task gets `{ name, deadline }`, with `deadline` in milliseconds since the
epoch. Resolve when the work is done. A task that throws or rejects reports a
failed run to the OS and its error to the LogBox (or the device log, when
headless). The OS treats `minimumInterval` as a lower bound: it batches work,
weighs battery and usage, and may run a task hours later or not at all.

`schedule` fails with `ERR_UNDECLARED` for a name the config does not declare,
and on an iOS device with `ERR_UNAVAILABLE` when Background App Refresh is
off. The Simulator has no BGTaskScheduler (see [Debugging](#debugging)).

[Location tasks](location.md#background-updates) are background tasks too,
which the platform runs with each batch of fixes instead of on a schedule:
`location.defineUpdates` defines one.

## Declare them in kuito.config.ts

`backgroundTasks` lists the names the app may schedule: letters, digits, `.`,
`_` and `-`. An environment's list replaces the base one
([apps](apps.md#environments)). The CLI writes them into the generated shells
(`src/cli/shells.ts`):

- **iOS**: `BGTaskSchedulerPermittedIdentifiers` (the names, as written) and
  `UIBackgroundModes` `fetch` and `processing`.
- **Android**: the `KuitoBackgroundTaskService` job service, the names as
  `dev.kuito.backgroundTasks` meta-data, and `RECEIVE_BOOT_COMPLETED`, which
  keeps registered jobs across reboots.

Declared tasks also put the `BackgroundTasks` module in the shell, whose job
service and launch handlers run them, whatever the bundle calls
(`configuredModules`, src/cli/modules.ts). An app without background tasks
gets none of this.

## How a task runs

1. **The OS starts the task.** On iOS a BGTaskScheduler launch handler fires;
   the module registers one for each declared name in its
   [launch](native-modules.md#launch), since BGTaskScheduler takes them only
   while the app launches. On Android JobScheduler starts
   `KuitoBackgroundTaskService` in the app's process.
2. **It becomes a run** with an id and a deadline, held by
   `KuitoBackgroundTasks` (one per platform, beside the shell's other shared
   objects). It goes to the runtime that started listening for runs last:
   the app's UI, when it opens while a headless runtime is up.
3. **If no runtime listens, the shell starts a headless one**,
   `KuitoHeadlessRuntime`, through the `startRuntime` the module's launch
   hands `KuitoBackgroundTasks` (the iOS app delegate and Android's
   `KuitoApplication` run it): a Hermes runtime with native modules and
   no view tree. It sets `__kuitoHostHeadless` before the kernel loads, then
   evaluates the kernel and the bundled app. The app's modules run, so their
   `define` calls run too, but the kernel skips `patch`, so nothing mounts. On
   Android, modules in a headless runtime have no activity: one that needs it
   fails with `ERR_NO_ACTIVITY`. `storage` works; `share()` and `permissions`
   prompts do not.
4. **The kernel listens for runs once a task is defined**
   (`src/runtime/background-tasks.ts`). Listening is the signal: the platform
   delivers waiting runs as the `run` event, and the kernel calls the task.
5. **The run ends once.** When the task settles the kernel calls `finish`, and
   the platform tells the OS (`setTaskCompleted(success:)`, `jobFinished`). If
   the OS expires the task first, or the deadline passes, the run ends as
   failed and a later `finish` is ignored. When the last run ends, a headless
   runtime shuts down, unless location tasks are running: their runs come
   every few seconds, so it stays up until their updates stop.

When the app is in the background but alive, its UI runtime is already
listening, so the task runs there, beside the mounted app, with no second
runtime. A run for a name the app never defined fails at once and says so.

The headless runtime evaluates the bundled app, never a Live Patch: a task
changed during `kuito dev` runs in the background as of the last build.

## Platform limits

|                    | iOS                                                                                                           | Android                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Scheduler          | BGTaskScheduler                                                                                               | JobScheduler, periodic and persisted                                             |
| Run time           | App refresh: about 30 s. Processing: minutes                                                                  | 10 minutes                                                                       |
| `deadline`         | 25 s (refresh) or 170 s (processing) after the start                                                          | 9 minutes after the start                                                        |
| `requiresCharging` | Makes it a processing task (`requiresExternalPower`), which iOS runs when the device is idle, often overnight | `setRequiresCharging`                                                            |
| `requiresNetwork`  | Applies to processing tasks; app refresh tasks are not guaranteed a connection                                | `NETWORK_TYPE_ANY`                                                               |
| Repeats            | iOS runs a request once; each run submits the next, from the schedule Kuito stores                            | Periodic jobs repeat                                                             |
| Off when           | Background App Refresh is off (`status()` says `denied`), Low Power Mode, or the user force-quit the app      | The user restricted the app's background use (`restricted`), or force-stopped it |

**Why JobScheduler, not WorkManager.** A periodic job with network and charging
constraints, kept across reboots, is all `schedule` needs, and JobScheduler
does it on every Android version Kuito supports. WorkManager adds about 0.4 MB
and its own database to bring the same features to API levels below 23 and to
chain work, neither of which Kuito uses. Job ids are the task name's Java
`hashCode`, made non-negative.

## Debugging

The OS decides when tasks run, so trigger them by hand. Each `schedule` logs
the command for its task.

**iOS device**: pause the app in the debugger (`lldb`, or Xcode's pause
button) and run:

```text
e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"sync"]
```

Resume, and the launch handler fires; `_simulateExpirationForTaskWithIdentifier:`
expires it. The task must be scheduled first: iOS simulates only a launch it
has a request for.

**iOS Simulator**: it has no BGTaskScheduler. `submit` fails there and the
debugger command finds no request, so `schedule` stores the schedule,
logs this instead of failing, and each declared task listens for a Darwin
notification:

```sh
xcrun simctl spawn booted notifyutil -p dev.kuito.backgroundTasks.run.sync
```

The run goes through the same path as a launch: the UI runtime if one
listens, otherwise a headless one. The Simulator suspends an app a moment
after it leaves the screen, and a notification posted then is delivered when
it returns. To try the headless path, start the app's binary with no scene,
the way iOS launches it for a task, then post the notification:

```sh
xcrun simctl terminate booted <bundle id>
DATA=$(xcrun simctl get_app_container booted <bundle id> data)
SIMCTL_CHILD_HOME=$DATA SIMCTL_CHILD_CFFIXED_USER_HOME=$DATA \
  xcrun simctl spawn booted "$(xcrun simctl get_app_container booted <bundle id>)/KuitoIOS" &
```

The two variables give it the app's own data, so `storage` is the app's.

**Android**:

```sh
adb shell cmd jobscheduler run -f <applicationId> <job id>
```

`-f` runs it even when its constraints are not met. To check the case where
the app is not running, put it in the background and kill only the process
(`adb shell am kill <applicationId>`); `am force-stop` stops the app, and
Android runs no jobs for a stopped app. `adb shell dumpsys jobscheduler`
lists the app's jobs.

On both platforms the run logs its outcome (`Background task 'sync'
succeeded`) to the device log: Console.app or `xcrun simctl spawn booted log
stream` on iOS, logcat tag `Kuito` on Android, where a headless runtime's
`console` output also goes.
