# Switch

Render the first matching state. Use it for mutually exclusive loading, empty and ready views.

## Display a playback state

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

Use Match as direct children. Only the first truthy condition renders; `fallback` handles no match. Use Toggle for an on/off input.

## Continue

Read [Control flow](control-flow.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Switch#members) for types and documented defaults.
