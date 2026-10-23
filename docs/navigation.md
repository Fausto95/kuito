# Navigate between screens

An app declares its routes one of two ways, and `kuito create --routes files|components` starts it on either. With **file routes**, the default, each file in `app/` is a route that exports its screen. With **component routes**, `app.tsx` declares them as `<Router>`, `<Tabs>`, `<Tab>` and `<Route>` components ([Router](router.md)). Either way, native stacks and tabs own the navigation UI, and `routes` and `navigate` are typed.

## Create routes and tabs

A file such as `app/(shows)/show/[id].tsx` creates `/show/:id`. Parenthesized folders group routes without adding URL segments. A root `_layout.tsx` exports the tabs; each top-level group matches a tab name. Files beginning with `_` or `.` are helpers, not routes.

```ts
// app/_layout.tsx
export const tabs = [
  { name: 'shows', title: 'Shows', icon: { ios: 'tv', android: 'tv' } },
  { name: 'profile', title: 'Profile', icon: { ios: 'person', android: 'person' } },
];
```

```tsx
// app/(shows)/index.tsx
import { Link, Text, VStack, routes, type RouteOptions } from 'kuito';

export const options: RouteOptions = { title: 'Shows' };

export default function Shows() {
  return (
    <VStack gap={12} padding={20}>
      <Link to={routes.show({ id: 42 })}>
        <Text>Show 42</Text>
      </Link>
    </VStack>
  );
}
```

```tsx
// app/(shows)/show/[id].tsx
import { Text, type RouteOptions, type ScreenProps } from 'kuito';

export type Params = { id: number };

export const options: RouteOptions<Params> = { title: ({ id }) => `Show ${id}` };

export default function Show({ id }: ScreenProps<Params>) {
  return <Text>Show {id}</Text>;
}
```

## Use typed destinations

Export a Params type for number, boolean or string parameters. The compiler generates `app/routes.generated.d.ts`; commit it for editor checking. The declaration below illustrates the generated type contract, followed by navigation actions. `navigate` pushes a destination, selects its tab if necessary, and avoids duplicating the same top route. `replace` replaces the top screen.

```ts
import type { RouteTo } from 'kuito';

declare module 'kuito' {
  interface Routes {
    index: RouteTo;
    show: RouteTo<{ id: number }>;
    profile: RouteTo;
    compose: RouteTo<{}, string>;
  }
}
```

```tsx
import { Button, Link, Text, VStack, goBack, navigate, routes } from 'kuito';

export function Actions() {
  return (
    <VStack gap={8}>
      <Button onPress={() => navigate(routes.show({ id: 7 }))}>Open show 7</Button>
      <Button onPress={() => navigate(routes.show({ id: 8 }), { replace: true })}>
        Replace with show 8
      </Button>
      <Link to={routes.profile()}>
        <Text>Profile</Text>
      </Link>
      <Button onPress={goBack}>Back</Button>
    </VStack>
  );
}
```

## Return a result from a presented screen

Set `presentation` to sheet, modal or fullScreen. `present` returns a promise resolved by the screen’s dismiss callback; other dismissal resolves undefined. A full-screen presentation on iOS needs an explicit close action. A pushed screen keeps its state while covered and unmounts when popped.

```tsx
// app/compose.tsx
import { Button, VStack, type RouteOptions, type ScreenProps } from 'kuito';

export type Result = string;

export const options: RouteOptions = { title: 'New note', presentation: 'modal' };

export default function Compose({ dismiss }: ScreenProps<{}, Result>) {
  return (
    <VStack padding={20}>
      <Button onPress={() => dismiss('Saved')}>Save</Button>
    </VStack>
  );
}
```

```tsx
import { Button, present, routes } from 'kuito';

export function NewNote() {
  return (
    <Button
      onPress={async () => {
        const note = await present(routes.compose()); // string | undefined
        if (note) console.log(note);
      }}
    >
      New note
    </Button>
  );
}
```

```tsx
import type { RouteOptions } from 'kuito';

export const options: RouteOptions = { presentation: 'sheet', snapPoints: ['50%', '100%'] };
```

## Add header actions and search

Use RouteOptions.header for native title, leading/trailing actions and search. A reactive header function can read signals. Supply labels for icon-only actions. Large titles and search use each platform’s native presentation.

```tsx
// app/(shows)/show/[id].tsx
import { Text, signal, type RouteOptions, type ScreenProps } from 'kuito';

export type Params = { id: number };

const saved = signal(false);
const query = signal('');

export const options: RouteOptions<Params> = {
  title: ({ id }) => `Show ${id}`,
  header: () => ({
    largeTitle: true,
    trailing: [
      {
        label: 'Save',
        icon: { ios: 'bookmark', android: 'bookmark' },
        disabled: saved.value,
        onPress: () => (saved.value = true),
      },
    ],
    search: { placeholder: 'Episodes', onChange: (text) => (query.value = text) },
  }),
};

export default function Show({ id }: ScreenProps<Params>) {
  return <Text>Show {id}</Text>;
}
```

## Follow navigation motion

Screen props expose a back-swipe progress source and, for sheet presentations, sheet motion. iOS follows the interactive pop frame by frame; Android back progress reflects commitment rather than every predictive-back frame.

```tsx
import { Box, interpolate, type ScreenProps } from 'kuito';

export default function Details({ back, sheet }: ScreenProps) {
  return (
    <Box
      flex={1}
      opacity={sheet ? interpolate(sheet.progress, [0, 1], [0.6, 1]) : 1}
      scale={back ? interpolate(back, [0, 1], [1, 0.94]) : 1}
    />
  );
}
```

## Enable incoming links

Export linking from the layout and declare schemes or verified domains in config. Linking is opt-in because an incoming URL can select a route. A malformed parameter or unmatched route is rejected rather than treated as a valid destination.

```ts
// app/_layout.tsx
export const linking = true;
```

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'MyApp',
  ios: { bundleIdentifier: 'com.example.myapp' },
  android: { applicationId: 'com.example.myapp' },
  urlSchemes: ['myapp'],
  linkDomains: ['example.com'],
} satisfies KuitoConfig;
```

## Continue

See [Linking](linking.md) for external URLs and [Sheet](sheet.md) for an overlay that is not a route.
