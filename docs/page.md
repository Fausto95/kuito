# Page

Define one page inside Pager. Use it to keep each onboarding step or gallery item sized to the viewport.

## Lay out an onboarding page

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

Page belongs inside Pager. It accepts container layout props for arranging its content. The parent Pager owns selection and swipe behavior.

## Continue

Read [Pager](pager.md) for a complete workflow.
See the [complete prop reference](https://kuito.dev/docs/components/Page#members) for types and documented defaults.
