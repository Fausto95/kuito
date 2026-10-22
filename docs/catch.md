# Catch

Replace failing child content with a recovery UI. Use it around independently recoverable sections.

## Retry a failed profile load

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

## Behavior

The fallback receives the error and a retry callback. Retry mounts fresh children. Catch handles render, lifecycle and unhandled initial resource failures; handle event-handler and task promise rejections at their call sites.

## Continue

Read [Async](async.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Catch#members) for types and documented defaults.
