# linking

Open URLs in other apps, and follow the links that open this one. On iOS it
is `UIApplication.open`; on Android an `ACTION_VIEW` intent.

```tsx
import { watch, linking } from 'kuito';

await linking.open('https://www.tvmaze.com');
if (await linking.canOpen('mailto:hi@example.com')) await linking.open('mailto:hi@example.com');

linking.url.value; // 'kuito://show/42', or null
watch(linking.url, (url) => console.log(url)); // in a component
```

| Member         | Is                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| `open(url)`    | Opens `url` in the app that handles it. Rejects with `ERR_URL` when no app does, or when `url` has no scheme.      |
| `canOpen(url)` | Whether an installed app handles `url` (below).                                                                    |
| `url`          | A signal: the link that last opened the app, starting with the one it launched with, or `null`. A reload keeps it. |

`url` is read synchronously. While something watches it, it follows each link
that opens the app while it runs; the same link twice in a row is one change.
The app's page in Settings is [`app.openSettings()`](app-state.md).

To navigate on deep links, a `<Router linking>` does it for you
([navigation.md](navigation.md#deep-links)); watch `url` yourself only for
links that are not routes.

## canOpen

Both platforms hide other apps unless the app declares what it asks about:

- iOS answers `true` for `http` and `https`, and for other schemes only when
  `LSApplicationQueriesSchemes` in `Info.plist` lists them (`ios.infoPlist` in
  [`kuito.config.ts`](apps.md#native-settings)).
- Android 11 and later answers for the intents the manifest's `<queries>`
  names. The shell declares `http`, `https`, `mailto`, `tel` and `sms`; an app adds
  more with `android.manifest.queries`.

`open` doesn't need either: it opens whatever the system can.

## The app's URL scheme

An app's schemes are `urlSchemes` in [`kuito.config.ts`](apps.md#native-settings):
`urlSchemes: ['myapp']` makes `myapp://show/42` open it, through `CFBundleURLTypes` on iOS
and a `VIEW` intent filter with `<data android:scheme="myapp" />` on Android. This
checkout's demo app, Reel, declares `kuito`, which the examples here use. The activity is
`singleTask`, so a link that arrives while the app runs reaches it through `onNewIntent`
instead of starting a second one.

### Link domains

`linkDomains: ['example.com']` makes the site's https links open the app instead of the
browser: universal links on iOS, an `applinks:example.com` associated domain each
(beside any `ios.associatedDomains` the app declares), and verified app links on Android,
an `autoVerify` `VIEW` intent filter for `https://example.com`. A domain is a host name,
without a scheme or path. The site proves the link is the app's: it serves
`/.well-known/apple-app-site-association` naming the app's team and bundle identifier, and
`/.well-known/assetlinks.json` naming its applicationId and signing certificate. Without
them, iOS and Android keep opening the browser.

A `<Router linking>` maps such a link onto a route by its path, as it does a custom
scheme's ([deep links](navigation.md#deep-links)): `https://example.com/show/42` is
`/show/42`.

Try one from the terminal:

```bash
xcrun simctl openurl booted kuito://show/1
```

```bash
adb shell am start -a android.intent.action.VIEW -d kuito://show/1
```

A link that starts the development shell from a cold start runs the app
bundled into the shell and reaches the dev server at the default URL, as the
first launch through `kuito dev` would. A release build opens links cold as
it does warm.

## How it is wired

The shell reports links to `KuitoLinks`, shell state in
`native/ios/App/Shell` and `dev.kuito.runtime.shell`, and the `Linking`
module reads them there: the latest link under a lock, for the JS thread's
synchronous read. A shell holds the module only when the app calls it
([native modules](native-modules.md#which-modules-a-shell-includes)):

- iOS: the scene delegate's connection options (the launch link, or a
  universal link's `webpageURL`), then `scene(_:openURLContexts:)` and
  `scene(_:continue:)`.
- Android: the activity's intent in `onCreate`, then `onNewIntent`.
- A tap on a [notification](notifications.md#taps) with a `url`: on iOS the
  notification center's delegate reports it; on Android the tap is an
  `ACTION_VIEW` intent to the activity, so it arrives as above.

`KuitoLinks` outlives the runtime, so the last link stays after a reload and
links keep flowing to whichever runtime is watching.
