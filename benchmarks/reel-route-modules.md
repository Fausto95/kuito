# Reel's cold start with route modules (2026-10-19)

Phase 11 compiles each route file to a module of its own, evaluated the first
time its route shows (docs/navigation.md#route-modules), and Reel moved onto
file routes: `demo/app/index.tsx`, the tabbed shell and first screen, and
`demo/app/show/[id].tsx`, the details sheet.

Wrapping Reel in the Router does not slow its cold start. Built from the same
commit, Reel on routes and Reel as one module start within a few milliseconds
of each other on both platforms. Both are still slower than `main` at
`3ea2a580`, before the move. That gap comes from two later changes to what
Reel's first screen renders ([below](#the-gap-to-3ea2a580)), not from the
Router.

Three builds, all debug builds started offline from their bundled bytecode:

| Build  | What it is                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------- |
| main   | `main` at `3ea2a580`, before Reel moved onto routes: its kernel, shell and `demo/app.tsx`      |
| single | `9e328424` with Reel as one module: `demo/app.tsx` from `6fbaab83^`, over today's `demo/reel/` |
| routes | `9e328424` as it is: Reel on file routes                                                       |

`single` and `routes` differ only in the Router and the chunks. `main` and
`single` differ only in the commits in between. Medians over runs, in ms. See
`docs/performance.md` for what the metrics mean.

Host: MacBook Pro (Mac15,6, Apple M3 Pro), macOS 27.0, Xcode 27.1, with other
sessions' simulators running.

## What a cold start evaluates

The gate: a cold start evaluates the kernel, the root and the first screen's
module only. Every run of `routes` traced these nested
`Kuito evaluate kuito://modules/<chunk>` sections, the same on both
platforms:

| Build  | Modules the cold start loads                                                       |
| ------ | ---------------------------------------------------------------------------------- |
| single | none: `app.hbc` is the whole app                                                   |
| routes | `ui-…` (the framework), `route-index` (the first screen), `store-…` (shared state) |

`route-show`, the details sheet, loads the first time a show opens, never at
startup.

## Kernel work

`__kuito.stats().total` after the app script runs and before anything else
does. That is Reel's first render, which in every build runs inside the
root's evaluation. It comes from `test/demo.test.ts`'s harness, which ran both
apps:

| Build  | Views | Thunk evaluations | Subscriptions | Props sent |
| ------ | ----: | ----------------: | ------------: | ---------: |
| single |   128 |               278 |            63 |        727 |
| routes |   129 |               283 |            66 |        721 |

The Router's first render (`readTable`, `initialState`, the stack computeds,
`NavigationStack`/`NavigationScreen`) adds one view, five thunk evaluations
and three subscriptions. After the catalog loads, the two builds differ by
the same amounts (940 against 935 thunks, 465 against 464 views).

## iOS

`node scripts/benchmark-ios.ts --device <udid> --runs 4 --label <label>`, on
a temporary iPhone 18 Pro simulator with iOS 27.0. Each round installs a
build, runs it four times and drops the first run, which pays for cold file
caches. The three builds alternate over three rounds.

| Build  | contentMs | evaluateMs |
| ------ | --------: | ---------: |
| main   |       196 |         20 |
| single |       211 |         21 |
| routes |       212 |         21 |

Runs (contentMs / evaluateMs):

- main: 196/20, 196/19, 201/21, 195/19, 198/20, 202/20, 198/20, 194/20, 191/20
- single: 200/21, 216/20, 200/21, 211/22, 219/20, 222/21, 209/21, 197/21, 211/22
- routes: 212/22, 202/21, 213/20, 211/20, 218/21, 207/21, 213/22, 226/21, 203/21

## Android

`node scripts/benchmark-android.ts --device emulator-5596 --port 1 --runs 7 --scenario launch --build main=… --build single=… --build routes=…`,
with the three builds alternating within each run. The AVD runs
Android 14 (API 34, 1080×2220 at 480 dpi)
with two cores and 2 GB of RAM. It was freshly booted and idle, and ran
offline.

| Build  | startMs | contentMs | evaluateMs | Hermes CPU in evaluate | Largest commit        |
| ------ | ------: | --------: | ---------: | ---------------------: | --------------------- |
| main   |     250 |       361 |         19 |                   11.7 | 794 mutations, 115 ms |
| single |     271 |       395 |         28 |                   13.8 | 858 mutations, 130 ms |
| routes |     268 |       379 |         33 |                   16.0 | 853 mutations, 120 ms |

"Hermes CPU in evaluate" is the time the `KuitoHermes` thread was on a core
during the root's `Kuito evaluate`, from the trace's `sched_switch` events.
`evaluateMs` is wall time and also counts the time the thread waited for a
core while the main thread drew.

Runs (startMs / contentMs / evaluateMs):

- main: 251/356/19, 247/369/15, 250/363/30, 243/344/17, 309/446/19, 254/361/23, 247/356/25
- single: 341/549/28, 255/399/29, 278/395/23, 271/380/27, 266/395/24, 282/406/28, 245/369/45
- routes: 256/379/37, 268/384/33, 263/358/31, 266/377/29, 271/386/25, 269/372/34, 269/405/35

The routes build spends about 2 ms more Hermes CPU in the root's evaluation
than the single module. The kernel does the same work in both (above), so
that time goes to the three chunk loads and their module setup, which the
trace does not split out. It does not reach `contentMs`.

On the same emulator under heavy host load (another session's builds, the
emulator swapping), every build's `evaluateMs` swung between 100 and 520 ms
and `contentMs` between 2 and 3.3 s. A load spike landing on one build makes
a gap like this document's first measurement (580 → 709 ms content, 18 →
108 ms evaluate). Compare `evaluateMs` only from an idle emulator, and
alternate builds.

## The gap to 3ea2a580

Reel's first render did not change in the Router's PR. It changed in two
later ones. These are `test/demo.test.ts`'s counters for Reel's first render,
run at each commit in its own checkout. Every commit after `6fbaab83` that the
table leaves out counts the same as the row above it; the four commits between
`3ea2a580` and `c3ae2f3d` were not counted one by one:

| Commit                                              | Views | Thunk evaluations | Props sent | Bytes stringified |
| --------------------------------------------------- | ----: | ----------------: | ---------: | ----------------: |
| `3ea2a580` (main above)                             |   119 |               150 |        668 |               453 |
| `c3ae2f3d` (#165)                                   |   119 |               153 |        670 |               453 |
| `6fbaab83` (#166, Reel on routes)                   |   120 |               159 |        664 |               439 |
| `dd691e3e` (#167, gestures as values)               |   129 |               172 |        721 |               764 |
| `482265ec` (#173, class expressions and `styles()`) |   129 |               283 |        721 |               764 |

#167 adds nine views and 57 props to the first screen. #173 nearly doubles
its thunk evaluations, from 172 to 283. On the emulator the largest commit
grew from 794 to 858 mutations, and the root's Hermes CPU from 11.7 to
13.8 ms. The counters put the 15 ms (iOS) and 34 ms (Android) between `main`
and `single` on those two changes, not on the Router. Their device time was
not measured commit by commit.
