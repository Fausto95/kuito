# Video

Play video in a native surface. Use it for trailers, lessons and media feeds.

## Play a streamed trailer with native controls

```tsx
import { Video } from 'kuito';

export default function Trailer() {
  return (
    <Video
      src={{ uri: 'https://example.com/trailer/master.m3u8' }}
      height={220}
      controls
      onError={(event) => console.log(event.code, event.message)}
    />
  );
}
```

## Behavior

Set a bounded size and handle `onError`. `controls` adds native playback controls. Use `videoRef` for play, pause and seek commands. Sources and playback features depend on the platform media implementation.

## Continue

Read [Audio](audio.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Video#members) for types and documented defaults.
