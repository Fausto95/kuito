# Match

Describe one branch of a Switch. Use it to associate a condition with a specific view.

## Render the matching playback state

```tsx
import { Match, Switch, Text, signal } from 'kuito';

export default function Status() {
  const state = signal<'idle' | 'playing' | 'paused'>('idle');

  return (
    <Switch fallback={<Text>Nothing playing</Text>}>
      <Match when={state.value === 'playing'}>
        <Text>Playing</Text>
      </Match>
      <Match when={state.value === 'paused'}>
        <Text>Paused</Text>
      </Match>
    </Switch>
  );
}
```

## Behavior

Match must be directly inside Switch. Its `when` condition can track state. A callback child receives the truthy value, as with Show.

## Continue

Read [Control flow](control-flow.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Match#members) for types and documented defaults.
