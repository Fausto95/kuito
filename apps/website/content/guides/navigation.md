# Navigation

Routes are files, shown in native stacks and tab bars: `UINavigationController` and `UITabBarController` on iOS, a native stack with predictive back and Material's bottom navigation on Android.

**Use it for**

- Tabs, each with its own stack of pushed screens.
- A screen presented over everything (a sheet, a modal, a full-screen cover) that answers the one that opened it.
- Links that open the app on a given screen.

## A tabbed app

Every `.tsx` file under `app/` is a route: its path is the route's path, and its static segments, in camelCase, are its name in `routes`.

```text
app/
  _layout.tsx             the tab bar
  (shows)/index.tsx       routes.index()             /
  (shows)/show/[id].tsx   routes.show({ id: 42 })    /show/:id
  (profile)/profile.tsx   routes.profile()           /profile
  compose.tsx             routes.compose()           /compose, presented
```

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

- The default export is the screen; it gets the route's params as props.
- `(name)` directories group files without adding a segment. With `tabs`, each top-level group is the tab of that name, and every top-level group must be one. Files outside the groups (`compose.tsx`) belong to no tab.
- `[name]` is a param, `[...name]` a final catch-all. A file or directory whose name starts with `_` or `.` is not a route: put helpers there.
- `export type Params` types the params (`string`, `number` or `boolean`); without it they are strings.

The compiler writes the table's types to `app/routes.generated.d.ts` on every build. Commit it: an editor and `tsc` then check each destination before the app runs, and `routes.show({ id: '42' })` is a type error. For the app above it declares, in effect:

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

## Move between screens

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

- `navigate(to)` selects the tab of a route in another tab, pops a tab to its first route, and pushes any other route, unless it is already on top with the same params. A presented route is presented.
- `{ replace: true }` replaces the top screen instead of pushing.
- `goBack()` closes the top presented screen, or pops the current stack; on a stack's first screen it does nothing.
- A screen stays mounted, with its state, while screens are pushed above it and while another tab is selected. Popping it unmounts it.

## Present a screen and get its answer

`presentation` in a route's `options` shows it over everything, tab bar included: `'sheet'`, `'modal'` or `'fullScreen'`. `present(to)` shows it and resolves with what the screen passes to `dismiss`, or `undefined` when it closes any other way.

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

A modal or full-screen route shows its screen in a stack of its own, with the header a pushed screen has. On iOS only the app closes a full-screen route: give it a button that calls `dismiss` or `goBack()`. A sheet route takes `snapPoints`, as [`Sheet`](./primitives.md#show-a-bottom-sheet) does:

```tsx
import type { RouteOptions } from 'kuito';

export const options: RouteOptions = { presentation: 'sheet', snapPoints: ['50%', '100%'] };
```

## Add buttons, a large title or search to the header

`header` adds to a screen's native header, or hides it with `false`. A function of the params runs again when a signal it reads changes, so an item can follow state.

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

- `leading` and `trailing` are buttons before and after the title, in reading order. Each has a `label` (read by screen readers even with an `icon`), an `onPress`, and may be `disabled`.
- `largeTitle` shows the title large under the bar; `search` adds a field whose `onChange` gets the text as the user types it.
- An unknown key, or a value of the wrong type, is an error.

## Follow a back swipe or a sheet

A screen's props carry two motion values that the platform moves every frame on the UI thread: `back`, how far a back swipe has taken the top screen away (0 at rest, 1 gone), and `sheet`, the sheet a sheet route shows in. Pass them to `interpolate` or `clamp`, as [Motion](./motion.md) shows.

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

`back` stays 0 for a presented screen. `sheet.progress` is 0 at the lowest snap point and 1 at the highest; `sheet.height` is the sheet's height on screen.

## Open the app from a link

`export const linking = true` in `_layout.tsx` turns deep links on; they are off by default, since a link can open any route. A link becomes the destination of the first route whose path it matches: `myapp://show/42` is `routes.show({ id: 42 })`. A segment that does not parse as its param's type does not match, and a link no route matches is a console warning.

```ts
// app/_layout.tsx
export const linking = true;
```

The schemes and domains that open the app are keys of `kuito.config.ts`:

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

## Platform differences

| What                         | iOS                                             | Android                                                     |
| ---------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| `presentation: 'sheet'`      | A sheet at its `snapPoints`, swiped down        | Material's bottom sheet at its `snapPoints`                 |
| `presentation: 'modal'`      | A page sheet at full height, swiped down        | A full-screen dialog; back closes it                        |
| `presentation: 'fullScreen'` | A cover only the app closes                     | The same full-screen dialog; back closes it                 |
| `header.leading`             | Bar buttons after the back button               | The first actions at the end of the bar                     |
| `header.largeTitle`          | UIKit's large title                             | Material 3's large top app bar                              |
| `header.search`              | A search field under the title                  | A search action that expands over the bar                   |
| `back`                       | Follows the pop frame by frame, back button too | 1 when the predictive back swipe commits, 0 once it is done |

## Related

- [Linking](../../../../docs/linking.md): URL schemes and verified domains
- [Primitives](./primitives.md#show-a-bottom-sheet): `Sheet` outside of routes
- [Motion](./motion.md): what `back` and `sheet` can drive
- [Navigation in depth](../../../../docs/navigation.md): shared-element transitions, tab icons, routes in JSX, what a Live Patch keeps
