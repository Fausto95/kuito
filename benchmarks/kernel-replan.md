# Re-plan cost of Reel's details sheet (Phase 4)

Showing another show in Reel's details sheet writes `shown`, the condition of
the sheet's `Show`. Before Phase 4 that re-planned Reel's whole app module;
after it, only the `Show`'s branch.

## How it was taken

- Kernel and Reel built from source and run in `node:vm` by the harness in
  `test/demo.test.ts` (`launch()`): the real compiler and kernel, a fake TVMaze.
  Node 24's JIT, not Hermes: the ratio is what carries over, not the times.
- Each of 30 rounds: open Breaking Bad's sheet, close it, then time
  `dispatch('top-82.press')` until the re-plan's microtask has run, and read
  `__kuito.stats().lastReplan`.
- Before: `main` at `4b75472` (before Phase 4). After: this branch.
- Host: Apple M3 Pro, macOS (Darwin 27.0.0), 2026-10-18.

## Result

| Build  | median ms | p10 ms | thunks | subscriptions created / destroyed | sendProp |
| ------ | --------: | -----: | -----: | --------------------------------: | -------: |
| before |      4.86 |   2.61 |    165 |                           59 / 59 |        6 |
| after  |      0.73 |   0.64 |     24 |                             1 / 1 |        6 |

The sheet's toggle costs about a seventh of what it did, under the half the
roadmap's gate asks for. `test/demo.test.ts` holds the counters to it: the
re-plan evaluates fewer than 50 thunks and drops fewer than 5 subscriptions.

On Hermes, on the iOS simulator and the Android emulator, the toggle takes
about 1 ms and re-plans 6 thunks, now that the sheet is a route of its own
([on-device-gates.md](on-device-gates.md#phase-4-details-sheet-toggle-on-hermes)).
