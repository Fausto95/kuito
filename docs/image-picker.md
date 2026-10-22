# mediaPicker

The system's photo picker and camera, for images and videos:
`PHPickerViewController` and `UIImagePickerController` on iOS, the Photo
Picker (`PickVisualMedia`) and the system camera app on Android.

```tsx
import { Button, Image, VStack, mediaPicker, signal } from 'kuito';

export function Cover() {
  const photo = signal('');

  const choose = async () => {
    const result = await mediaPicker.pick({ selectionLimit: 0, maxWidth: 1600 });

    if (!result.canceled) photo.value = result.assets[0].uri;
  };

  return (
    <VStack>
      <Image src={{ uri: photo.value }} aspectRatio={1.5} />
      <Button onPress={choose}>Choose a photo</Button>
    </VStack>
  );
}
```

`pick(options?)` and `capture(options?)` resolve
`{ canceled: true, assets: null }` when the user closes the picker without
picking, and `{ canceled: false, assets }` otherwise. Each asset is:

| Field      | Meaning                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `uri`      | A `file://` URI in the app's cache directory. `<Image src>` and `fileSystem` read it: `fileSystem.readBytes(uri)` gives its bytes as an `ArrayBuffer`. |
| `width`    | In pixels, upright: the EXIF orientation is already applied.                                                                                           |
| `height`   | In pixels, upright.                                                                                                                                    |
| `type`     | `'image'` or `'video'`.                                                                                                                                |
| `mimeType` | `image/jpeg` or `image/png` for images; the file's own type for videos.                                                                                |
| `fileName` | The library's name for it, with the written extension (see below).                                                                                     |
| `fileSize` | In bytes, of the file at `uri`.                                                                                                                        |
| `duration` | Videos only, in milliseconds.                                                                                                                          |

| Option           | Default    | Meaning                                                                                    |
| ---------------- | ---------- | ------------------------------------------------------------------------------------------ |
| `mediaTypes`     | `'images'` | `'images'`, `'videos'`, or both as a list.                                                 |
| `selectionLimit` | `1`        | Library only. How many assets the user may pick; `0` for the system's limit.               |
| `quality`        | `1`        | JPEG quality of written images, 0 to 1.                                                    |
| `maxWidth`       | none       | Images wider than this, in pixels, are scaled down to fit, keeping their aspect ratio.     |
| `maxHeight`      | none       | The same for height. Both together fit the image inside the box.                           |
| `allowsEditing`  | `false`    | iOS only: the system editor crops the image (or trims the video) before the call resolves. |

An option outside its range throws a `TypeError` at the call, before any
picker opens: a `quality` outside 0 to 1, a negative or fractional
`selectionLimit`, an unknown or empty `mediaTypes`, a size that isn't a
positive number, or `allowsEditing` with a `selectionLimit` other than 1.
`maxWidth` and `maxHeight` go further than Expo, which has no resize.

## What lands in the cache

Picked and captured media are written to `ImagePicker/` in the app's cache
directory (`fileSystem.cache`), off the main thread, one asset after
another:

- **Images are re-encoded.** Decoded at the smallest size that covers
  `maxWidth` and `maxHeight`, turned upright, and written as JPEG at
  `quality`. An image with transparency is written as PNG instead, and
  `quality` doesn't apply. EXIF metadata, location included, is not copied.
  HEIC from the iOS library becomes JPEG, so the file works everywhere.
- **Videos are copied as they are.** No transcoding; `width` and `height`
  account for the track's rotation.

The system may clear the cache when storage runs low. Move an asset the app
keeps into `fileSystem.documents` ([fileSystem](file-system.md)).

## Permissions

Picking from the library needs no permission on either platform: both
pickers run out of process and hand over only what the user picks.

`capture` asks for the `camera` permission through
[permissions](permissions.md) first and rejects with `ERR_PERMISSION` when it
isn't granted. On Android that happens only if the app declares the camera
permission (`permissions: { camera: … }` in `kuito.config.ts`): the system
camera app needs none, but Android refuses the intent to an app that declares
it without having it.

The module ships `NSCameraUsageDescription` and `NSMicrophoneUsageDescription`
(video records sound) in its spec, `native/modules/image-picker/image-picker.ts`. The app's
`permissions.camera` and `permissions.microphone` reasons replace them.

## Platform differences

|                        | iOS                                  | Android                                                                                      |
| ---------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------- |
| Library                | `PHPickerViewController`             | the Photo Picker; androidx.activity backports it to devices without one                      |
| `allowsEditing`        | `UIImagePickerController`, one asset | rejects with `ERR_UNSUPPORTED`: Android has no system editor                                 |
| Camera with both types | the camera offers photo and video    | takes a photo: the camera app does one or the other; ask for `'videos'` alone to record      |
| `fileName`             | the library's name                   | the Photo Picker's name, which is the media id (`1000000020.jpg`); a capture's is the file's |
| No camera              | `ERR_CAMERA_UNAVAILABLE`             | `ERR_CAMERA_UNAVAILABLE` when no app answers the capture intent                              |

A second call while a picker is open rejects with `ERR_BUSY` on iOS.

On Android the pickers run as other activities, started through
`KuitoActivityResults` ([native modules](native-modules.md)). The camera
writes to a `content://` URI that the module's own FileProvider
(`KuitoImagePickerFileProvider`) grants for the capture only, in the cache's
`ImagePicker/` directory. If Android kills the app while a picker is open,
the result is lost with the JavaScript that waited for it.

### Simulators and emulators

- The iOS simulator (iOS 27) shows the camera UI with no feed: the shutter
  does nothing, so capture can only be tested on a device. Cancel works.
  Older simulators have no camera at all, and `capture` rejects with
  `ERR_CAMERA_UNAVAILABLE`.
- The Android emulator's camera app captures photos from its virtual scene.
  Its video recording can stop responding (API 34 image); the call then
  resolves `canceled`.
- `xcrun simctl addmedia <device> file…` and `adb push` plus a media scan put
  photos and videos in the libraries.
