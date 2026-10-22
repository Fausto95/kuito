# Keep a foreground screen awake

Prevent automatic display sleep for an active reader, navigation session or presentation.

## Keep a presentation visible

```tsx
import { Video, keepAwake, app } from 'kuito';

function Player() {
  keepAwake(); // held while Player is mounted
  return <Video src={{ uri: 'https://example.com/movie.mp4' }} flex={1} />;
}

// For the app's life, outside any component; call the result to let go.
const release = keepAwake({ scope: app });
release();
```

## Behavior and limits

The override belongs to the scope that creates it and is released with that scope. Outside a component use an explicit scope and dispose it when finished. Keeping the screen on does not grant background execution or prevent the app from being suspended.

## Continue

Read [Lifecycle events](lifecycle-events.md) for the related workflow. The API reference lists every method, option, event and return type.
