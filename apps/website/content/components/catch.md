# Catch

`Catch` renders its children until they throw, then its `fallback` in their place; the rest of the screen stays as it was. `fallback` is an element, or a function of the error and `retry`, which renders the children again from scratch.

Use it for:

- a section that may fail to load without taking the screen down;
- a "Try again" after an error;
- a widget from a package you don't control.

```tsx
import { Button, Catch, Text, VStack, resource } from 'kuito';

function Profile() {
  const user = resource(async () => {
    const response = await fetch('https://example.com/me');

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    return (await response.json()) as { name: string };
  });

  return <Text>{user.data.value?.name ?? ''}</Text>;
}

export default function Account() {
  return (
    <Catch
      fallback={(error, retry) => (
        <VStack gap={8}>
          <Text>{'Could not load: ' + String(error)}</Text>
          <Button onPress={retry}>Try again</Button>
        </VStack>
      )}
    >
      <Profile />
    </Catch>
  );
}
```

It takes what a component under it throws while it renders, in an `effect`, a `watch` or `onMount`, and in the load a `resource` starts on mount when that component does not render `error` itself. An event handler's throw never reaches a Catch, nor a failed `refresh()` or `task.run()`: the promise rejects for its caller.

## Patterns

### Guard each row of a List

A `List` row renders as a module of its own: a Catch around the list does not cover it. Put one inside the row.

```tsx
import { Catch, List, Text } from 'kuito';

function Row(props: { title: string }) {
  if (!props.title) throw new Error('A row needs a title');

  return <Text padding={16}>{props.title}</Text>;
}

export default function Rows(props: { titles: string[] }) {
  return (
    <List
      flex={1}
      data={props.titles}
      itemKey={(title, index) => title + index}
      renderItem={({ item }) => (
        <Catch fallback={<Text padding={16}>This row failed</Text>}>
          <Row title={item} />
        </Catch>
      )}
    />
  );
}
```

### Handle the error in the component instead

A component that reads its resource's `error` in what it renders handles the failure itself, and the Catch never sees it.

```tsx
import { Text, resource } from 'kuito';

export default function Headline() {
  const news = resource(async () => (await fetch('https://example.com/headline')).text());

  return <Text>{news.error.value ? 'No news today' : (news.data.value ?? '')}</Text>;
}
```

## Platform differences

None. What no Catch takes reaches the LogBox ([LogBox](../guides/logbox.md)).

## Related

- [Loading](./loading.md)
- [Control flow, in depth](../../../../docs/control-flow.md#catch)
