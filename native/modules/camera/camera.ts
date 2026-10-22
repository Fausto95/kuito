import { defineModule, fn, view } from '../../../src/native/define-module';
import type { CameraMethods, CameraProps } from '../../../src/native/camera';
// The view asks for the camera and the microphone.
import '../permissions/permissions';

export type PictureOptions = {
  /** JPEG quality from 0 to 1; 1 by default. */
  quality?: number;
  /** Also return the JPEG's bytes. */
  bytes?: boolean;
};

export type CameraPicture = {
  /** A JPEG in the app's cache directory (`file://`), for `<Image source>` and `fileSystem`. */
  uri: string;
  /** In pixels, upright. */
  width: number;
  height: number;
  /** The JPEG's bytes, when `bytes` asked for them. */
  bytes?: ArrayBuffer;
};

export type RecordingOptions = {
  /** Seconds; the recording stops on its own after it. None by default. */
  maxDuration?: number;
};

export type CameraRecording = {
  /** An MPEG-4 video in the app's cache directory (`file://`). */
  uri: string;
  /** Seconds. */
  duration: number;
};

// A live camera preview: AVFoundation on iOS, CameraX on Android.
export default defineModule('Camera', {
  view: view<CameraProps, CameraMethods>({
    events: ['ready', 'error', 'barcode'],
    methods: {
      takePicture: fn.main.callback<(options?: PictureOptions) => Promise<CameraPicture>>(),
      startRecording: fn.main.callback<(options?: RecordingOptions) => Promise<CameraRecording>>(),
      stopRecording: fn.main.callback<() => Promise<CameraRecording>>(),
      pausePreview: fn.main<() => Promise<void>>(),
      resumePreview: fn.main<() => Promise<void>>(),
    },
  }),
  ios: {
    class: 'KuitoCameraModule',
    infoPlist: {
      NSCameraUsageDescription: 'Take photos and videos to use in this app.',
      NSMicrophoneUsageDescription: 'Record sound with the videos you take.',
    },
  },
  android: {
    class: 'dev.kuito.runtime.modules.camera.KuitoCameraModule',
    dependencies: [
      'androidx.camera:camera-camera2:1.5.3',
      'androidx.camera:camera-lifecycle:1.5.3',
      'androidx.camera:camera-video:1.5.3',
      'androidx.camera:camera-view:1.5.3',
      'com.google.mlkit:barcode-scanning:17.3.0',
    ],
    permissions: ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO'],
    features: [
      { name: 'android.hardware.camera.any', required: false },
      { name: 'android.hardware.microphone', required: false },
    ],
  },
});
