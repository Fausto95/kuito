import { defineModule, event, fn } from '../../../src/native/define-module';
import '../permissions/permissions';

/** `aac` writes `.m4a` on both platforms; `wav` is 16-bit PCM, iOS only (docs/audio.md). */
export type RecordingFormat = 'aac' | 'wav';

export type RecordingQuality = 'low' | 'medium' | 'high';

/** A player to make under the id `nextId` gave it. */
export type AudioPlayerRequest = {
  id: number;
  /** An http(s), `file://` or `asset:///` URI. */
  uri: string;
  volume: number;
  rate: number;
  loop: boolean;
};

export type AudioRecorderRequest = {
  id: number;
  format: RecordingFormat;
  quality: RecordingQuality;
  metering: boolean;
};

export type AudioRecording = { uri: string; duration: number };

export type AudioMode = {
  /** iOS: play while the ring/silent switch is on silent. Defaults to true. */
  playsInSilentMode: boolean;
  /** Play alongside other apps' audio instead of stopping it. Defaults to false. */
  mixWithOthers: boolean;
  /** Lower other apps' audio while this app plays. Defaults to false. */
  duckOthers: boolean;
  /** iOS: needed before a recorder starts. Defaults to false. */
  allowsRecording: boolean;
  /** Keep playing in the background; iOS also needs `ios.backgroundModes: ['audio']`. Defaults to false. */
  staysActiveInBackground: boolean;
};

/** `began`: the system paused playback (a call, an alarm). `ended`: it is over. */
export type AudioInterruptionType = 'began' | 'ended';

export type AudioInterruption = {
  type: AudioInterruptionType;
  /** On `ended`: the system suggests resuming. */
  shouldResume: boolean;
};

/** What the platform reports when a player's state changes; never on a clock. */
export type AudioPlayerStatus = {
  id: number;
  isLoaded: boolean;
  playing: boolean;
  isBuffering: boolean;
  /** Seconds, sampled as the state changed. */
  currentTime: number;
  /** -1 while unknown, and for a live stream. */
  duration: number;
  /** This change is playback reaching the end. */
  ended: boolean;
  volume: number;
  rate: number;
  loop: boolean;
  error: string | null;
};

/** What the platform reports when a recorder starts or stops, and its level while metering. */
export type AudioRecorderStatus = {
  id: number;
  recording: boolean;
  currentTime: number;
  metering: number | null;
};

// Playback, recording and the app's audio session (docs/audio.md):
// AVPlayer and AVAudioRecorder on iOS, MediaPlayer and MediaRecorder on
// Android. Players and recorders are native objects keyed by the id
// `nextId` hands out; a reload releases them all.
export default defineModule('Audio', {
  nextId: fn.sync<() => number>(),
  createPlayer: fn.main<(request: AudioPlayerRequest) => Promise<void>>(),
  play: fn.main<(id: number) => Promise<void>>(),
  pause: fn.main<(id: number) => Promise<void>>(),
  seekTo: fn.main<(id: number, seconds: number) => Promise<void>>(),
  setVolume: fn.main<(id: number, volume: number) => Promise<void>>(),
  setRate: fn.main<(id: number, rate: number) => Promise<void>>(),
  setLoop: fn.main<(id: number, loop: boolean) => Promise<void>>(),
  releasePlayer: fn.main<(id: number) => Promise<void>>(),
  createRecorder: fn.main<(request: AudioRecorderRequest) => Promise<void>>(),
  /** Asks for the microphone first. */
  startRecording: fn.main.callback<(id: number) => Promise<void>>(),
  pauseRecording: fn.main<(id: number) => Promise<void>>(),
  stopRecording: fn.main<(id: number) => Promise<AudioRecording>>(),
  releaseRecorder: fn.main<(id: number) => Promise<void>>(),
  setAudioMode: fn.main<(mode: AudioMode) => Promise<void>>(),
  playerStatus: event<AudioPlayerStatus>(),
  recorderStatus: event<AudioRecorderStatus>(),
  interruption: event<AudioInterruption>(),
  ios: { class: 'KuitoAudioModule' },
  android: {
    class: 'dev.kuito.runtime.modules.audio.KuitoAudioModule',
    permissions: [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    ],
    services: [
      {
        name: 'dev.kuito.runtime.modules.audio.KuitoAudioService',
        exported: 'false',
        foregroundServiceType: 'mediaPlayback',
      },
    ],
  },
});
