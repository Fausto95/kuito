# permissions

`permissions` checks and requests runtime permissions with one status model on
iOS and Android. Modules that need device access (Camera, Location, Image
Picker, audio recording, Notifications) ask through it natively, so a status
means the same thing in every module.

```tsx
import { app, permissions } from 'kuito';

const { status, canAskAgain } = await permissions.check('camera');

if (status === 'undetermined') await permissions.request('camera');
else if (status === 'denied' && !canAskAgain) await app.openSettings();
```

| Function        | Does                                                                      |
| --------------- | ------------------------------------------------------------------------- |
| `check(name)`   | Resolves the current status without prompting.                            |
| `request(name)` | Shows the system prompt if the system will, and resolves with the answer. |

`check` and `request` resolve `{ status, canAskAgain }`:

| `status`       | Meaning                                                            |
| -------------- | ------------------------------------------------------------------ |
| `granted`      | The app has access.                                                |
| `limited`      | The user allowed part of it: a selection of photos.                |
| `denied`       | The user said no, or a policy (parental controls, MDM) forbids it. |
| `undetermined` | The app hasn't asked yet. `request` will prompt.                   |

`canAskAgain` is `false` when `request` can't show the prompt any more. Only
the user can change the answer then, in Settings: send them there with
[`app.openSettings()`](app-state.md). When it's `true`, `request` either prompts or answers at
once with a status that needs no prompt (`granted`).

An unknown name rejects with `ERR_ARGUMENT`.

## Permission names

| Name             | iOS                                           | Android                                                                       |
| ---------------- | --------------------------------------------- | ----------------------------------------------------------------------------- |
| `camera`         | `AVCaptureDevice` (video)                     | `CAMERA`                                                                      |
| `microphone`     | `AVCaptureDevice` (audio)                     | `RECORD_AUDIO`                                                                |
| `photos`         | `PHPhotoLibrary`, read and write              | `READ_MEDIA_IMAGES` + `READ_MEDIA_VIDEO` (13+), `READ_EXTERNAL_STORAGE` (≤12) |
| `location`       | When in use (`requestWhenInUseAuthorization`) | `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION`                             |
| `locationAlways` | Always (`requestAlwaysAuthorization`)         | `location`, then `ACCESS_BACKGROUND_LOCATION` (10+)                           |
| `notifications`  | Alerts, badges and sounds                     | `POST_NOTIFICATIONS` (13+), the app's notification switch (≤12)               |

`locationAlways` is location while the app is in the background, for
[background updates](location.md#background-updates). It asks for `location`
first when the app doesn't have it yet: iOS offers "when in use" in the same
prompt, and Android 11 and later take background access only once foreground
access is granted, so `request` shows the foreground prompt, then the
background one (Android's is the app's location page in Settings). On
Android 9 and earlier `locationAlways` is `location`.

## Differences from Expo

Kuito follows Expo's statuses and its `canAskAgain`, with these deliberate
differences:

- **One module, names as arguments.** Expo spreads permissions over each
  module (`Camera.requestCameraPermissionsAsync()`). Kuito has one
  `permissions` module, and the device modules use it natively. App code
  doesn't need to import the camera to ask for the camera.
- **`limited` is a status.** Expo reports a photo selection as `granted` with
  `accessPrivileges: 'limited'`. A partial grant behaves differently from a
  full one, so Kuito makes it a status of its own.
- **No `granted` boolean and no `expires`.** `status === 'granted'` says the
  same thing. Runtime permissions don't expire.
- **Approximate location and provisional notifications are `granted`,** as in
  Expo. [Location](location.md) reports the accuracy in each fix's
  `coords.accuracy`; it's a property of the fix, not of the permission.

## Platform notes

- **iOS prompts once.** After a denial, `canAskAgain` is `false` and only
  Settings can change it. `limited` photo access keeps `canAskAgain: true`.
- **Android can ask again after one denial.** The second denial is final
  (`canAskAgain: false`). Android reports "never asked" and "denied for good"
  the same way, so Kuito remembers which permissions it asked for. One case
  slips through, as it does in Expo: dismissing the prompt without answering,
  or closing Android 14's photo picker without choosing, reads as a final
  denial, though Android would prompt again.
- **Android 14 selected photos** are `limited`. Requesting `photos` again
  shows the prompt so the user can change the selection.
- **iOS offers "always" once.** With "when in use" granted, `locationAlways`
  is `undetermined` until `request` offers the step up, and `denied` with
  `canAskAgain: false` after the user keeps "when in use". From an
  undetermined status, choosing "Allow While Using App" gives iOS's
  provisional "always": `granted`, until iOS asks the user again the first
  time the app uses location in the background.
- **Android 12 and earlier have no notification permission.** `notifications`
  is `granted` when the app's notifications are on, and otherwise `denied`
  with `canAskAgain: false`.

## Declare them in kuito.config.ts

An app lists the permissions it uses in [`kuito.config.ts`](apps.md#kuitoconfigts),
each with the reason iOS shows in its prompt:

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'Reel',
  ios: { bundleIdentifier: 'com.example.reel' },
  android: { applicationId: 'com.example.reel' },
  permissions: {
    camera: 'Scan tickets at the door.',
    location: 'Find screenings near you.',
    notifications: true,
  },
} satisfies KuitoConfig;
```

The CLI writes exactly these into the shells it generates:

- **iOS**: each reason under its `Info.plist` key: `NSCameraUsageDescription`,
  `NSMicrophoneUsageDescription`, `NSPhotoLibraryUsageDescription`,
  `NSLocationWhenInUseUsageDescription`,
  `NSLocationAlwaysAndWhenInUseUsageDescription` or
  `NSFaceIDUsageDescription`.
  Notifications take no reason, so their value is `true`.
- **Android**: the runtime permissions in the table above, plus
  `USE_BIOMETRIC` for `biometrics`, in a manifest at
  `.kuito/android/AndroidManifest.xml` that Gradle merges over the
  framework's (`kuito.manifest`).

`biometrics` is a declaration only, not a name `check` or `request`
takes: the system asks for Face ID the first time
[`secureStore`](secure-store.md#authentication) uses it.

A permission the config doesn't declare can't be granted. iOS ends an app
that asks without a usage string, so declare before you call `request`.
Android denies an undeclared permission without prompting. A misspelled
name or an empty reason fails the build with an error naming the key.

`locationAlways` needs `location` declared too: iOS shows the "when in use"
reason first. Declaring it also turns on
[background location updates](location.md#background-updates).

This checkout's demo app declares every permission, so each demo can ask
for its own (`demo/kuito.config.ts`). Opening `native/android` in Android
Studio without the CLI builds it with none.

## From another module

A module that needs a permission asks through the native helper and doesn't
call the system API itself:

```swift
// iOS. Call on the main thread; the completion runs there too.
KuitoPermissions.request(.camera) { response in
    guard response.status == .granted else {
        return promise.reject("ERR_PERMISSION", "Camera access is \(response.status.rawValue)")
    }
    // …
}
```

```kotlin
// Android. Call on the main thread; the completion runs there too.
KuitoPermissions.request(context.activity, KuitoPermission.CAMERA) { response ->
    if (response.status != KuitoPermissionStatus.GRANTED)
        return@request promise.reject("ERR_PERMISSION", "Camera access is ${response.status.wire}")
    // …
}
```

To add a permission, add its name to `PermissionName` in
`src/native/permissions.ts`, a case to `KuitoPermission` and a source to the
table in `KuitoPermissions.swift`, and a row to `KuitoPermission.kt`. Then
make it declarable: a key in `KuitoPermissions` (`src/cli/kuito-config.ts`)
with its check, its `Info.plist` key and manifest entries in the table in
`src/cli/shells.ts`, and a reason in `demo/kuito.config.ts`.
`test/native-modules.test.ts` and `test/cli-shell.test.ts` fail until every
part has it.
