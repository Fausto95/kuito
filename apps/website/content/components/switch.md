# Switch

`Switch` renders the first `Match` whose `when` is truthy, and `fallback` when none is. `Switch` is control flow: the native on/off control is [Toggle](./toggle.md).

Use it for:

- the content of the selected segment or filter;
- a screen's states: loading, empty, failed, ready;
- any choice among more than two branches.

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

`Match` must be a direct child of `Switch`.

## Patterns

### Show a request's states

```tsx
import { Button, Match, Spinner, Switch, Text, resource } from 'kuito';

export default function Weather() {
  const forecast = resource(async () => (await fetch('https://example.com/forecast')).text());

  return (
    <Switch fallback={<Spinner />}>
      <Match when={forecast.running.value}>
        <Spinner />
      </Match>
      <Match when={forecast.error.value}>
        <Button onPress={() => void forecast.refresh().catch(console.log)}>Try again</Button>
      </Match>
      <Match when={forecast.data.value}>{(text) => <Text>{text}</Text>}</Match>
    </Switch>
  );
}
```

A `Match`'s children may be a callback too, receiving its truthy `when` value.

## Platform differences

None: Switch is resolved before anything reaches the platform.

## Related

- [Show](./show.md)
- [SegmentedControl](./segmented-control.md)
- [Control flow](../language/control-flow.md)
