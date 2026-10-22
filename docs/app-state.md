# app

The app's own state and actions: whether it is in the foreground, the
system's memory warnings, and its page in Settings.

```tsx
import { Button, app, watch } from 'kuito';

declare function refresh(): void;

const cache = new Map<string, ArrayBuffer>();

app.state.value; // 'active' | 'background' | 'inactive'

export function Feed() {
  // Both follow the platform until the component unmounts.
  watch(app.state, (state) => {
    if (state === 'active') refresh();
  });
  app.watch('memoryWarning', () => cache.clear());

  return <Button onPress={() => void app.openSettings()}>Open Settings</Button>;
}
```

| Member                       | Is                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `state`                      | A signal of the state. Read unwatched, it asks the platform.                    |
| `watch('memoryWarning', fn)` | Calls `fn()` when the system is low on memory; returns its `EventSubscription`. |
| `openSettings()`             | Opens this app's page in the system Settings. Resolves once it opened.          |

The platform is observed only while something watches `app.state`: a
component's `watch`, or a prop or text that reads it. Starting to observe
reports the state the platform starts from, so a change made while it was
still starting (on Android the app often resumes in that moment) is not
lost, and the same state twice is one change.

`app.watch` in a component starts when the component mounts and stops when it
unmounts; outside one it starts at once, and the returned subscription's
`remove()` stops it. Another event name throws a `TypeError`.

## States

| State        | iOS                                                              | Android                                                                   |
| ------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `active`     | The scene is in the foreground and receives events.              | The activity is resumed.                                                  |
| `inactive`   | Launching, or between: a call, the app switcher, Control Center. | Started but paused: another activity (the share sheet) covers part of it. |
| `background` | Another app or the home screen is in front.                      | The activity is stopped.                                                  |

React Native reports `background` on Android as soon as the activity
pauses, and has no `inactive` there. Kuito reports `inactive` while it is
paused but still visible, so a share sheet doesn't count as leaving the app;
code that checks for `background` or for not `active` works the same.

`memoryWarning` comes from `applicationDidReceiveMemoryWarning` on iOS, and
from `onTrimMemory` at `RUNNING_LOW`, `RUNNING_CRITICAL` and `COMPLETE` on
Android. Android 14 and later no longer send the running levels.

## How it is wired

The shell reports the lifecycle to `KuitoAppLifecycle`, shell state in
`native/ios/App/Shell` and `dev.kuito.runtime.shell`, so a shell without
the module still keeps it: the scene
delegate's `sceneDidBecomeActive`, `sceneWillResignActive`,
`sceneWillEnterForeground` and `sceneDidEnterBackground` on iOS, and the
activity's `Lifecycle` on Android. The module reads and observes it there,
and so does [brightness](brightness.md). `KuitoAppLifecycle` outlives the
runtime, so a reload starts with the current state, and `app.state` is right
before anything watches it.

Try it from the terminal: `xcrun simctl launch` another app to background
this one, or on Android:

```bash
adb shell input keyevent KEYCODE_HOME
```

```bash
adb shell am send-trim-memory dev.kuito.shell RUNNING_LOW
```
