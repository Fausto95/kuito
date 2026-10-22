import { easing, timing } from '../ui/animations';
import type { Motion } from '../ui/motion';
import type { ElementRef } from '../ui/refs';
import type { EventSubscription } from './modules';
import {
  field,
  freeMotion,
  motionValue,
  signal,
  stateRef,
  watching,
  type ReadonlySignal,
} from './scope';
import VideoModule from '../../native/modules/video/video';
import type { NativeViewEvent, NativeViewHandle, NativeViewProps } from './views';

/** A stream or a file: `https://` (HLS `.m3u8` or progressive MP4) or `file://`. */
export type VideoSource = { uri: string };

/** CSS's `object-fit` for the picture: letterboxed, cropped, or distorted to fit. */
export type VideoObjectFit = 'contain' | 'cover' | 'fill';

export type VideoLoadEvent = NativeViewEvent<
  'load',
  {
    /** Seconds; null for a live stream. */
    duration: number | null;
    currentTime: number;
    /** The picture's size in pixels. */
    naturalSize: { width: number; height: number };
  }
>;

export type VideoProgressEvent = NativeViewEvent<
  'progress',
  {
    currentTime: number;
    /** How far the player has buffered, in seconds from the start. */
    playableDuration: number;
  }
>;

export type VideoBufferEvent = NativeViewEvent<'buffer', { isBuffering: boolean }>;
export type VideoEndEvent = NativeViewEvent<'end'>;
export type VideoErrorEvent = NativeViewEvent<'error', { code: string; message: string }>;

export type VideoPlaybackStateEvent = NativeViewEvent<
  'playbackStateChange',
  {
    isPlaying: boolean;
    /** Seconds, as the state changed. */
    currentTime: number;
    /** The speed it plays at; 1 is normal. */
    rate: number;
  }
>;

export type VideoFullscreenEvent = NativeViewEvent<'fullscreenChange', { fullscreen: boolean }>;

export type VideoPictureInPictureEvent = NativeViewEvent<
  'pictureInPictureChange',
  { active: boolean }
>;

/** What a `Video` plays and how: its source, playback, picture fit, controls and events. */
export type VideoViewProps = {
  src?: VideoSource;
  /** False plays once the source loads. `play()` and `pause()` act at once; the prop applies when it changes. */
  paused?: boolean;
  muted?: boolean;
  /** 0 to 1. */
  volume?: number;
  /** Above 0; 1 is normal speed. */
  rate?: number;
  loop?: boolean;
  /** `'contain'` by default. */
  objectFit?: VideoObjectFit;
  /** The platform's playback controls over the picture. */
  controls?: boolean;
  /** Milliseconds between `onProgress` events while playing; 250 by default, 0 for none. */
  progressInterval?: number;
  onLoad?: (event: VideoLoadEvent) => void;
  onProgress?: (event: VideoProgressEvent) => void;
  onBuffer?: (event: VideoBufferEvent) => void;
  onEnd?: (event: VideoEndEvent) => void;
  onError?: (event: VideoErrorEvent) => void;
  onPlaybackStateChange?: (event: VideoPlaybackStateEvent) => void;
  onFullscreenChange?: (event: VideoFullscreenEvent) => void;
  onPictureInPictureChange?: (event: VideoPictureInPictureEvent) => void;
};

/** What a `ref` to a Video calls. Each resolves once the player has done it. */
export type VideoMethods = {
  /** Seconds from the start; exact, not the nearest key frame. */
  seek(seconds: number): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  enterFullscreen(): Promise<void>;
  exitFullscreen(): Promise<void>;
  /** iOS only: rejects with `ERR_UNSUPPORTED` on Android (docs/video.md). */
  startPictureInPicture(): Promise<void>;
  stopPictureInPicture(): Promise<void>;
};

export type VideoHandle = NativeViewHandle<VideoMethods>;

/** Props of `Video`: what it plays and how, with the style, layout and accessibility props and a ref to a `VideoHandle`. */
export type VideoProps = NativeViewProps<VideoViewProps, VideoMethods>;

/**
 * A Video's ref that also holds its state: signals for what the player is
 * doing, and `time` and `duration` as motion values. Between the player's
 * reports the UI thread moves `time` along at the player's rate, so a bound
 * progress bar needs no `onProgress`. Called while a component sets up, which
 * owns it, like `ref()`, and passed as the view's `ref`.
 */
export type VideoRef = ElementRef<VideoHandle> & {
  readonly playing: ReadonlySignal<boolean>;
  readonly loaded: ReadonlySignal<boolean>;
  readonly buffering: ReadonlySignal<boolean>;
  readonly fullscreen: ReadonlySignal<boolean>;
  readonly pictureInPicture: ReadonlySignal<boolean>;
  readonly error: ReadonlySignal<string | null>;
  /** Seconds from the start. */
  readonly time: Motion<number>;
  /** Seconds; 0 until loaded, and for a live stream. */
  readonly duration: Motion<number>;
  /** Calls `listener` each time playback reaches the end. */
  watch(event: 'ended', listener: () => void): EventSubscription;
};

const seconds = (event: object, key: string): number | null => {
  const value = field(event, key);

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

export function videoRef(): VideoRef {
  return stateRef<VideoHandle, Omit<VideoRef, 'current'>>('video.ref', () => {
    const playing = signal(false);
    const loaded = signal(false);
    const buffering = signal(false);
    const fullscreen = signal(false);
    const pictureInPicture = signal(false);
    const error = signal<string | null>(null);
    const time = motionValue(0);
    const duration = motionValue(0);
    const ended = new Set<() => void>();
    let rate = 1;

    /** Holds `time` at `at`, or runs it from there toward the end while playing. */
    const anchor = (at: number) => {
      const end = duration.value > 0 ? duration.value : at + OPEN_ENDED;

      time.value = at;

      if (playing.value && !buffering.value)
        time.value = timing({
          duration: (Math.max(0, end - at) / rate) * 1000,
          easing: easing.linear,
        }).to(end);
    };

    return {
      state: {
        playing,
        loaded,
        buffering,
        fullscreen,
        pictureInPicture,
        error,
        time,
        duration,
        watch(event, listener) {
          if (event !== 'ended')
            throw new TypeError(`video.watch: no '${String(event)}' event; watch ended`);

          return watching('video.watch', () => {
            ended.add(listener);

            return { remove: () => ended.delete(listener) };
          });
        },
      },
      listeners: {
        load(event) {
          loaded.value = true;
          duration.value = seconds(event, 'duration') ?? 0;
          anchor(seconds(event, 'currentTime') ?? 0);
        },
        playbackStateChange(event) {
          playing.value = field(event, 'isPlaying') === true;
          rate = seconds(event, 'rate') ?? rate;
          anchor(seconds(event, 'currentTime') ?? time.value);
        },
        progress(event) {
          anchor(seconds(event, 'currentTime') ?? time.value);
        },
        buffer(event) {
          buffering.value = field(event, 'isBuffering') === true;
          anchor(time.value);
        },
        end() {
          ended.forEach((listener) => listener());
        },
        error(event) {
          const message = field(event, 'message');

          error.value = typeof message === 'string' ? message : 'The video failed to play';
        },
        fullscreenChange(event) {
          fullscreen.value = field(event, 'fullscreen') === true;
        },
        pictureInPictureChange(event) {
          pictureInPicture.value = field(event, 'active') === true;
        },
      },
      release() {
        ended.clear();
        freeMotion(time);
        freeMotion(duration);
      },
    };
  });
}

/** How long a clock with no end runs before the next report re-anchors it: a day. */
const OPEN_ENDED = 86_400;

/**
 * A video player view: AVPlayer on iOS, Media3 ExoPlayer on Android. Give it
 * a height; a module's view is sized by its style. See docs/video.md.
 */
export const Video = VideoModule.view;
