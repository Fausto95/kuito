# Reel's Discover screen: headless against the simulator (Phase 18)

Phase 18's gate: Reel's Discover screen renders headlessly with frames within
1 pt of the iOS simulator for a fixed font table. The headless host
(`docs/testing.md`) is compared with an iPhone 18 Pro simulator on the same
data, view by view.

## How it was taken

- Simulator: "P18 iPhone 18 Pro" (iOS 27.0, 402×874 pt at @3x), a simulator of
  its own, on an Apple M3 Pro, 2026-10-19. Base commit `3fd669d7`.
- `kuito dev ios` ran Reel (`demo/`). Once Discover had loaded, `record`
  saved the run as a `.krec` and the tree the iOS renderer described: one line
  per view with its frame from the layout engine. These are
  `test/fixtures/headless/reel-discover.krec` and `.krec.tree`.
- The response TVMaze gave for `/shows?page=0` was saved at the same time
  (`tvmaze-shows-page-0.json`).
- The font table was measured on the same simulator with UIKit, for every
  face and glyph pair the recording's labels use:

```bash
node scripts/ios-font-table.ts "P18 iPhone 18 Pro" test/fixtures/headless/reel-discover.krec test/fixtures/headless/ios-fonts.json
```

- Headless: `demo/app` compiled for iOS, rendered on the headless host with
  that table, TVMaze answered with the saved response, `Haptics.isSupported`
  false and `Clipboard.hasText` false as on the simulator
  (`test/headless.test.ts`).

## Result

| Comparison                        | Views | Same line | Frames within 1 pt | Largest difference |
| --------------------------------- | ----: | --------: | -----------------: | -----------------: |
| Headless render vs simulator tree |   858 |       858 |                858 |             0.0 pt |
| Headless replay of the `.krec`    |   858 |       858 |                858 |             0.0 pt |

Every line matches: kind, parent, frame to the tenth of a point the tree
prints, flattening and text, including the list rows the rails bound. Rows
are listed without frames, as the device prints them.

Two things the first comparison found, both now in the headless renderer:

- UIKit turns kerning off for a kern of zero, which the iOS renderer sets on
  every label: kerning applies only to text with a `letterSpacing` (it moved
  "Top rated" by 2.4 pt).
- A label's width keeps a trailing space (it moved "#1 TONIGHT · " by
  4.4 pt).

And one about binding order: UIKit lays the rails out newest first, so the
last rail binds its rows first and its cells get the lower view numbers.
