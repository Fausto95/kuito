# Pager

Swipe between pages with a native pager. Use it for onboarding, image galleries and full-screen sections.

## Swipe through onboarding

```tsx
import { Page, Pager, Text, VStack, signal } from 'kuito';

export default function Onboarding() {
  const page = signal(0);

  return (
    <VStack flex={1}>
      <Pager page={page} flex={1}>
        <Page justifyContent="center" alignItems="center">
          <Text>Welcome</Text>
        </Page>
        <Page justifyContent="center" alignItems="center">
          <Text>Sync your library</Text>
        </Page>
        <Page justifyContent="center" alignItems="center">
          <Text>You're all set</Text>
        </Page>
      </Pager>
      <Text textAlign="center">{`${page.value + 1} of 3`}</Text>
    </VStack>
  );
}
```

## Behavior

`page` is a zero-based index and can be a signal for two-way updates. Put each page inside Page. Give the pager a bounded size so native paging has a viewport.

## Continue

Read [Reactivity](reactivity.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Pager#members) for types and documented defaults.
