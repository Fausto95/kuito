import type { ElementRef } from '../ui/refs';
import { field, signal, stateRef, type ReadonlySignal } from './scope';
import CameraModule, {
  type CameraPicture as SpecCameraPicture,
  type CameraRecording as SpecCameraRecording,
  type PictureOptions as SpecPictureOptions,
  type RecordingOptions as SpecRecordingOptions,
} from '../../native/modules/camera/camera';
import type { NativeViewEvent, NativeViewHandle } from './views';

export type CameraFacing = 'back' | 'front';

/** For pictures. `torch` keeps the light on instead, for the preview and videos. */
export type CameraFlash = 'off' | 'on' | 'auto';

/** What the camera is set up to capture; switching reconfigures the session. */
export type CameraMode = 'picture' | 'video';

/** The symbologies `barcodes` can scan for (see docs/camera.md#barcodes). */
export type BarcodeType =
  | 'qr'
  | 'aztec'
  | 'datamatrix'
  | 'pdf417'
  | 'ean13'
  | 'ean8'
  | 'upc_e'
  | 'code39'
  | 'code93'
  | 'code128'
  | 'itf14';

export type CameraReadyEvent = NativeViewEvent<'ready'>;

/**
 * The camera failed or can't run: `ERR_PERMISSION` (access denied),
 * `ERR_CAMERA_UNAVAILABLE` (no such camera, or none on this device), or
 * `ERR_CAMERA` (the session failed or was interrupted).
 */
export type CameraErrorEvent = NativeViewEvent<'error', { code: string; message: string }>;

export type BarcodeEvent = NativeViewEvent<
  'barcode',
  {
    /** The event's `type` is `barcodeScanned`; this is the code's. */
    format: BarcodeType;
    data: string;
    /** In the view's points, from its top-left corner. */
    bounds: { x: number; y: number; width: number; height: number };
  }
>;

/** Props of `Camera`: which camera, its light, zoom and mode, the codes to scan, and its events. */
export type CameraProps = {
  /** `back` by default. */
  facing?: CameraFacing;
  /** `off` by default. */
  flash?: CameraFlash;
  /** Keeps the light on while the preview runs. */
  torch?: boolean;
  /** From 0 (none) to 1 (the most the camera can), linearly. 0 by default. */
  zoom?: number;
  /** `picture` by default. Record videos in `video`. */
  mode?: CameraMode;
  /** Records videos without sound, and without asking for the microphone. */
  mute?: boolean;
  /** Scans for these codes while the preview runs. */
  barcodes?: BarcodeType[];
  /** The preview is running: the camera can take pictures and record. */
  onReady?: (event: CameraReadyEvent) => void;
  onError?: (event: CameraErrorEvent) => void;
  /** Each time a code of `barcodes` comes into view. */
  onBarcode?: (event: BarcodeEvent) => void;
};

export type PictureOptions = SpecPictureOptions;
export type CameraPicture = SpecCameraPicture;
export type RecordingOptions = SpecRecordingOptions;
export type CameraRecording = SpecCameraRecording;

export type CameraMethods = {
  /** Takes a picture with the current flash; the view must be ready. */
  takePicture(options?: PictureOptions): Promise<CameraPicture>;
  /**
   * Starts recording, in `video` mode. Resolves with the video once the
   * recording ends: `stopRecording`, `maxDuration`, the app leaving the
   * foreground, or the view unmounting.
   */
  startRecording(options?: RecordingOptions): Promise<CameraRecording>;
  /** Ends the recording, and resolves with the same video `startRecording` does. */
  stopRecording(): Promise<CameraRecording>;
  /** Freezes the preview and stops the camera, keeping the view. */
  pausePreview(): Promise<void>;
  resumePreview(): Promise<void>;
};

/** What a Camera's `ref` holds: `ref<CameraHandle>()`. */
export type CameraHandle = NativeViewHandle<CameraMethods>;

/**
 * A Camera's ref that also holds its state: `ready` while the preview
 * runs and the camera can take pictures and record, and the last `error`.
 * Called while a component sets up, which owns it, like `ref()`.
 */
export type CameraRef = ElementRef<CameraHandle> & {
  readonly ready: ReadonlySignal<boolean>;
  readonly error: ReadonlySignal<{ code: string; message: string } | null>;
};

export function cameraRef(): CameraRef {
  return stateRef<CameraHandle, Omit<CameraRef, 'current'>>('camera.ref', () => {
    const ready = signal(false);
    const error = signal<{ code: string; message: string } | null>(null);

    return {
      state: { ready, error },
      listeners: {
        ready() {
          ready.value = true;
          error.value = null;
        },
        error(event) {
          const code = field(event, 'code');
          const message = field(event, 'message');

          ready.value = false;

          error.value = {
            code: typeof code === 'string' ? code : 'ERR_CAMERA',
            message: typeof message === 'string' ? message : 'The camera failed',
          };
        },
      },
      release() {},
    };
  });
}

/**
 * A live camera preview (AVFoundation on iOS, CameraX on Android), contributed
 * by the Camera module. Size it with its style, and drive it through its ref.
 * It asks for the camera through permissions when it first runs, and stops
 * while the app is in the background or the view is off screen. See
 * docs/camera.md.
 */
export const Camera = CameraModule.view;
