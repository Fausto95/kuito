# Demos

This directory is a Kuito app of its own, like one `kuito create` makes:
its [`kuito.config.ts`](kuito.config.ts), [`package.json`](package.json)
(depending on the checkout as `file:..`) and
[`tsconfig.json`](tsconfig.json).

**[`app/`](app) is the demo: Reel, a streaming catalog over TVMaze, as file-based routes.**
Its screens and components live in [`reel/`](reel). See
[the walkthrough](../docs/showcase.md).

```sh
npm run ios        # here, or npm run demo:ios at the checkout's root
npm run android
```

The other demos run in the same app through `--entry`, relative to this
directory: `npm run ios -- --entry navigation.tsx`.

[`routes/`](routes) is [`navigation.tsx`](navigation.tsx) as file-based routes
(`--entry routes`).

[`native-views.tsx`](native-views.tsx) shows a view a native module
contributes, the Slider (`--entry native-views.tsx`).

[`forms.tsx`](forms.tsx) shows the standard form controls: the DatePicker
for a day, a meeting's date and time, and a disabled one, and a Select with
a placeholder and a disabled one, and a SegmentedControl and a disabled one
(`--entry forms.tsx`).

[`components.tsx`](components.tsx) shows the standard components that aren't
form controls: a ContextMenu around a Pressable, a disabled one, and a Pager
of three pages the user swipes or a tap turns, a thin Blur over color
stripes, and a Drawing of a progress ring a tap fills (`--entry components.tsx`).

[`storage.tsx`](storage.tsx) counts its launches in a `persisted` signal,
logs each in a database table whose query follows its writes, and keeps a
token in a secure `persisted` signal: kill and relaunch it to see all three
persist (`--entry storage.tsx`).

[`audio.tsx`](audio.tsx) plays two remote MP3s at once and a downloaded one,
seeks and loops, records and plays the take back, and logs interruptions
(`--entry audio.tsx`).

[`system-apis.tsx`](system-apis.tsx) shows AppState, Device, Localization,
appearance, keepAwake and brightness, and logs their changes
(`--entry system-apis.tsx`).

[`location.tsx`](location.tsx) asks for location, reads a fix, watches it
move, names the place and follows the compass (`--entry location.tsx`;
move it with `xcrun simctl location <device> set <lat>,<lon>` or
`adb emu geo fix <lon> <lat>`).

[`image-picker.tsx`](image-picker.tsx) picks photos and videos and takes
photos with ImagePicker, and shows what came back
(`--entry image-picker.tsx`).

[`camera.tsx`](camera.tsx) previews the camera, flips, zooms, takes a
picture into an Image, records a short video, pauses, and unmounts and
remounts the view (`--entry camera.tsx`; the iOS Simulator has no
camera, the Android emulator's virtual scene does).

[`text-rows.tsx`](text-rows.tsx) is the text layout benchmark: 200 labels
in rows too narrow for them, every one retitled each second, so every pass
measures them all again ([performance](../docs/performance.md#text-layout);
`--entry text-rows.tsx`).

[`image-grid.tsx`](image-grid.tsx) shows twelve large photos in small squares
and logs how long they took: the image benchmark in
[performance.md](../docs/performance.md#images) (`--entry image-grid.tsx`).
