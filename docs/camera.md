# Camera

`Camera` is a live camera preview that takes pictures and records videos:
AVFoundation on iOS, CameraX on Android. It is a
[native view](native-modules.md#views) of the `Camera` module, so it lays out like any
view, and its ref takes the pictures.

```tsx
import { Button, Camera, Image, Show, Text, VStack, cameraRef, signal } from 'kuito';

export function Snapshot() {
  const camera = cameraRef(); // while the component sets up, like ref()
  const photo = signal<string | null>(null);

  const shoot = async () => {
    const picture = await camera.current?.takePicture({ quality: 0.8 });

    photo.value = picture?.uri ?? null; // file:// in the cache: <Image src> and fileSystem read it
  };

  return (
    <VStack flex={1}>
      <Camera
        ref={camera}
        flex={1}
        facing="back"
        onError={(event) => console.warn(event.message)}
      />
      <Text>{camera.ready.value ? 'Ready' : 'Starting…'}</Text>
      <Button onPress={shoot}>Take picture</Button>
      <Show when={photo.value}>{(uri) => <Image src={uri} width={96} height={96} />}</Show>
    </VStack>
  );
}
```

`demo/camera.tsx` exercises everything below (`--entry camera.tsx` in `demo/`).

## Props

| Prop        | Default     | Meaning                                                                          |
| ----------- | ----------- | -------------------------------------------------------------------------------- |
| `facing`    | `'back'`    | `'back'` or `'front'`. Switching rebinds the camera.                             |
| `mode`      | `'picture'` | `'picture'`, or `'video'` to record. Video mode can still take pictures.         |
| `flash`     | `'off'`     | `'off'`, `'on'` or `'auto'`, for pictures. A camera without a flash ignores it.  |
| `torch`     | `false`     | Keeps the light on while the preview runs.                                       |
| `zoom`      | `0`         | 0 (none) to 1 (the most the camera can), linearly; clamped to that range.        |
| `mute`      | `false`     | Records without sound, and without asking for the microphone.                    |
| `barcodes`  | none        | Scans for these codes while the preview runs. See [Barcodes](#barcodes).         |
| `onReady`   |             | The preview started: pictures and recordings can begin. Again after each resume. |
| `onError`   |             | `{ code, message }`. See [Errors](#errors).                                      |
| `onBarcode` |             | `{ format, data, bounds }` each time a code comes into view; `bounds` in points. |

The preview fills the view and crops what overflows (`aspectFill`), so give the
view the shape you want the user to see. The captured picture is the whole
sensor frame, not the crop.

## Ref methods

`cameraRef()` makes a ref that also holds the camera's state as signals:
`ready` while the preview runs and the camera can take pictures and record,
and `error`, the last `{ code, message }` it failed with. A plain
`ref<CameraHandle>()` works for the methods alone. `current` holds the view's
element, with these ([how native views get methods](native-modules.md#how-views-work)):

| Method                     | Resolves                                                                  |
| -------------------------- | ------------------------------------------------------------------------- |
| `takePicture(options?)`    | `{ uri, width, height, bytes? }`: an upright JPEG in the cache directory. |
| `startRecording(options?)` | `{ uri, duration }` (seconds), once the recording ends, whatever ends it. |
| `stopRecording()`          | The same `{ uri, duration }`, once the file is complete.                  |
| `pausePreview()`           | Freezes the last frame and stops the camera, keeping the view.            |
| `resumePreview()`          | Starts the camera again; `onReady` follows.                               |

`takePicture` takes `{ quality, bytes }`: JPEG quality from 0 to 1 (1 by
default), and whether to return the JPEG's bytes too, as an `ArrayBuffer`
that holds them with no copy ([bytes](native-modules.md#bytes)). `startRecording`
takes `{ maxDuration }` in seconds, and needs `mode="video"`. A recording ends
on `stopRecording`, at `maxDuration`, when the app leaves the foreground, or
when the view unmounts; the file is complete in each case and
`startRecording` resolves with it. Videos are MPEG-4 with H.264 video, HD
where the camera can.

Calls reject with a `NativeModuleError`:

| Code                 | When                                                                       |
| -------------------- | -------------------------------------------------------------------------- |
| `ERR_NOT_READY`      | The camera isn't running: before `onReady`, while paused or backgrounded.  |
| `ERR_MODE`           | `startRecording` without `mode="video"`.                                   |
| `ERR_RECORDING`      | Recording twice, stopping without a recording, or the recording failed.    |
| `ERR_PERMISSION`     | The microphone was denied; record with `mute`, or ask again.               |
| `ERR_VIEW_NOT_FOUND` | The view unmounted ([native views](native-modules.md#a-view-on-the-wire)). |

## Lifecycle

- **Permission.** The view asks for `camera` through
  [Permissions](permissions.md) the first time it should run, and again each
  time it comes back on screen after a denial. A denial is an `onError` with
  `ERR_PERMISSION`. Ask earlier with `permissions.request('camera')` to choose
  when the prompt shows. Recording with sound asks for `microphone` the same
  way, at `startRecording`.
- **When it runs.** The camera runs while the view is on screen (in a window
  and visible), the app is in the
  foreground ([AppState](app-state.md)) and the preview isn't paused. It stops
  otherwise, so another app can use it, and `onReady` fires each time it
  starts again.
- **Release.** Unmounting the view lets the camera go, and so does a runtime
  reload: both reach the view's `unmount` ([native views](native-modules.md#views)).
  A recording in progress finishes, and `startRecording` resolves with it.
  Leaving the screen, as under a pushed screen, only stops the camera; the
  view keeps its configuration and starts again when it comes back.
- **Errors are reported once** until the camera starts again: the view retries
  what failed on each change, and a repeated failure stays quiet.

## Errors

`onError` receives `{ code, message }`:

| Code                     | Meaning                                                                    |
| ------------------------ | -------------------------------------------------------------------------- |
| `ERR_PERMISSION`         | Camera access is denied, or iOS has no usage string to ask with.           |
| `ERR_CAMERA_UNAVAILABLE` | This device has no camera facing that way. The iOS Simulator has none.     |
| `ERR_CAMERA`             | The session failed or the system stopped the camera (another app took it). |

## Barcodes

`barcodes` scans for `qr`, `aztec`, `datamatrix`, `pdf417`, `ean13`,
`ean8`, `upc_e`, `code39`, `code93`, `code128` and `itf14`.
`onBarcode` fires once per code as it comes into view, with its
`format`, `data` and `bounds`, the code's box in the view's points from its
top-left corner. The event's own `type` is `barcodeScanned`. A code that
leaves the view and comes back fires again.

- **iOS** scans with `AVCaptureMetadataOutput`, which costs nothing extra.
- **Android** adds an `ImageAnalysis` use case while `barcodes` is
  non-empty, and decodes its frames with ML Kit's barcode scanner, with the
  model bundled in the app. A frame is decoded at a time; frames that arrive
  meanwhile are dropped. Boxes are mapped from the analysis frame through
  `PreviewView`, so they land where the code shows in the cropped preview.

Both platforms report a UPC-A code as `ean13`, its data with a leading zero.
Android's `itf14` reads Interleaved 2 of 5 codes of any length; iOS reads
only the 14-digit ones.

### Why bundled ML Kit on Android

Android has no barcode decoder of its own. The choices were:

- **ML Kit, Play Services variant** (`play-services-mlkit-barcode-scanning`)
  adds almost nothing to the APK, but the model downloads through Google
  Play Services on first use: scanning finds nothing until it arrives, and
  never on devices without Play Services (Huawei, Amazon, AOSP builds, many
  emulator images).
- **ZXing core** is pure Java and about 0.5 MB, but it is in maintenance
  mode, leaves converting camera frames to us, and reads small, skewed or
  blurred codes noticeably worse than ML Kit.
- **ML Kit, bundled** (`com.google.mlkit:barcode-scanning:17.3.0`) works on
  every device from the first frame, reads all eleven formats, and decodes
  skewed and partly damaged codes.

Bundled ML Kit costs about 2.4 MB per app, paid by every app that imports
`Camera`, scanning or not. That buys the same behavior on every Android
device, which a camera prop should have.

## Why CameraX on Android

Camera2 directly would cost nothing in size, but every app would pay in
behavior: Camera2 leaves stream sizes, preview transforms, orientation, the
sensor's rotation, recording with `MediaRecorder`, and dozens of device quirks
to the caller. CameraX is Google's layer over it and handles those, with
`PreviewView`, `ImageCapture` and `VideoCapture` that this module uses as is.
The cost: CameraX 1.5.3 (`camera-core`, `camera-camera2`, `camera-lifecycle`,
`camera-video`, `camera-view`) is about 2.5 MB of class files before dexing;
it is commonly put at about 1 MB in a shrunk release APK (not measured here:
the CLI has no release build yet). Modules ship only in apps that import them
([which modules a shell includes](native-modules.md#which-modules-a-shell-includes)),
so only apps that render a `Camera` pay it. CameraX 1.6 needs compileSdk
36 and AGP 8.9; the shell is on 35 and 8.7, so the module stays on 1.5.

Each view is its own CameraX `LifecycleOwner`: resumed while the camera
should run, created while it shouldn't (detached, hidden, backgrounded or
paused), and destroyed when the view unmounts, so CameraX opens, closes and
unbinds the device without code of ours in the activity.

## The module

`native/modules/camera`: its spec, `camera.ts`, imports `Permissions` and
`AppState`, so a shell with the camera has both. It declares the iOS camera
and microphone usage strings (the app's `permissions` in `kuito.config.ts`
replace them), Android's `CAMERA` and `RECORD_AUDIO`, and
`android.hardware.camera.any` and `android.hardware.microphone` as optional
features, so Google Play still lists the app for devices without them.

## Platform notes

- **iOS** runs each capture session on its own serial queue; nothing blocks
  the main thread. Pictures and videos stand the way the interface does. The
  iOS Simulator has no camera: the view asks for permission and reports
  `ERR_CAMERA_UNAVAILABLE`. Pictures, recording, flash, torch, zoom and
  barcodes need a device.
- **iOS zoom** stops at 10×: past it, digital zoom is only blur.
- **Android** pictures are re-encoded upright at the requested quality, off
  the UI thread. A paused preview keeps its last frame (`PreviewView` in
  compatible mode, a TextureView).
- **Front camera** pictures aren't mirrored on either platform, though the
  preview is.

## Not yet

- Photo and video to the library: save with
  [fileSystem](file-system.md) or share the URI; a media-library module would
  own that.
- Focus and exposure points, HDR, RAW, and video stabilization settings.
