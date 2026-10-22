# Loading

`Loading` shows its `fallback` until the resources its children start have settled, then shows the children for good. The children render at once, hidden, so their resources start loading while the fallback stands beside them.

Use it for:

- a screen that fetches its data before it shows;
- several sections that should appear together;
- a spinner in place of content, with no loading flags of your own.

```tsx
import { Loading, Spinner, Text, resource } from 'kuito';

function Profile() {
  const user = resource(
    async () => (await fetch('https://example.com/me')).json() as Promise<{ name: string }>,
  );

  return <Text>{user.data.value?.name ?? ''}</Text>;
}

export default function Account() {
  return (
    <Loading fallback={<Spinner />}>
      <Profile />
    </Loading>
  );
}
```

## Patterns

### Show sections together

It waits for every `resource` under it, at any depth, so the sections appear together. A `task` is never waited for, and `List` rows render apart, outside it.

```tsx
import { Loading, Spinner, Text, VStack, resource } from 'kuito';

function Stats() {
  const stats = resource(async () => (await fetch('https://example.com/stats')).text());

  return <Text>{stats.data.value ?? ''}</Text>;
}

function Recent() {
  const recent = resource(async () => (await fetch('https://example.com/recent')).text());

  return <Text>{recent.data.value ?? ''}</Text>;
}

export default function Dashboard() {
  return (
    <Loading fallback={<Spinner />}>
      <VStack gap={12}>
        <Stats />
        <Recent />
      </VStack>
    </Loading>
  );
}
```

### Load a part on its own

A `Loading` inside another handles the resources under it, so its part shows its own fallback while the rest is shown.

```tsx
import { Loading, Spinner, Text, VStack, resource } from 'kuito';

function Comments() {
  const comments = resource(async () => (await fetch('https://example.com/comments')).text());

  return <Text>{comments.data.value ?? ''}</Text>;
}

export default function Post() {
  return (
    <VStack gap={12}>
      <Text>The post itself</Text>
      <Loading fallback={<Spinner />}>
        <Comments />
      </Loading>
    </VStack>
  );
}
```

Once it shows its children it keeps showing them: a later `refresh()` shows its progress through the resource's own `running`. A failure settles a resource too; the component, or a [Catch](./catch.md) around it, shows the error.

## Platform differences

None.

## Accessibility

A screen reader does not read the hidden children while the fallback shows. Give a fallback with no text, such as a Spinner, a `label`.

## Related

- [Catch](./catch.md)
- [Spinner](./spinner.md)
- [Control flow, in depth](../../../../docs/control-flow.md)
