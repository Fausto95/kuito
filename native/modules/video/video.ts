import { defineModule, fn, view } from '../../../src/native/define-module';
import type { VideoMethods, VideoViewProps } from '../../../src/native/video';
// The players play through the app's audio session.
import '../audio/audio';

// A video player: AVPlayer on iOS, Media3 ExoPlayer on Android.
export default defineModule('Video', {
  view: view<VideoViewProps, VideoMethods>({
    events: [
      'load',
      'progress',
      'buffer',
      'end',
      'error',
      'playbackStateChange',
      'fullscreenChange',
      'pictureInPictureChange',
    ],
    methods: {
      seek: fn.main.callback<(seconds: number) => Promise<void>>(),
      play: fn.main<() => Promise<void>>(),
      pause: fn.main<() => Promise<void>>(),
      enterFullscreen: fn.main.callback<() => Promise<void>>(),
      exitFullscreen: fn.main.callback<() => Promise<void>>(),
      startPictureInPicture: fn.main.callback<() => Promise<void>>(),
      stopPictureInPicture: fn.main.callback<() => Promise<void>>(),
    },
  }),
  ios: { class: 'KuitoVideoModule' },
  android: {
    class: 'dev.kuito.runtime.modules.video.KuitoVideoModule',
    dependencies: [
      'androidx.media3:media3-exoplayer:1.9.4',
      'androidx.media3:media3-exoplayer-hls:1.9.4',
      'androidx.media3:media3-ui:1.9.4',
    ],
  },
});
