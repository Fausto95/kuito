# Signal writes in the kernel host (plan 2.2)

What one signal write costs the kernel as its readers grow: 1, 100 and
1,000 `subscribe` listeners, subscribed computeds, or `opacity` bindings of
an app's `Text` views, all reading one signal. `bindings` change with each
write; `steady` ones run again and keep their value, so no prop is sent.

## How it is taken

```bash
node scripts/benchmark-signals.ts
```

- The kernel bundled as a shell loads it (`release` profile; `--profile dev`
  for the other), run in `node:vm` with a host that drops its batches.
- Each write lands as app code's does, on the next microtask; a round makes
  100,000 reader-notifications' worth of writes, and a run reports the
  median of seven rounds after one to warm up.
- Bytes per write are the heap's growth over a round with no collection in
  it (Node runs with `--expose-gc --max-semi-space-size=256`, so a scavenge
  rarely lands inside one), after ten writes that follow the collection
  that starts the round. They count what the kernel and the harness
  allocate; the row with no reader is the harness's own cost.
- Node's JIT, not Hermes: compare builds with each other, never these times
  with a device's.
- Host: Apple M3 Pro, macOS (Darwin 27.0.0), Node 24.16.0, 2026-10-20, with
  other builds running beside it: times move by tens of percent between
  runs, bytes do not.

## Result

Before: `main` at `005bd58`. After: the linked graph of plan 2.2
(`src/runtime/reactive-graph.ts`). Medians of five runs that alternated
the two kernels, so load on the host fell on both alike.

| readers | scenario  | µs before | µs after | bytes before | bytes after |
| ------: | --------- | --------: | -------: | -----------: | ----------: |
|       0 | listeners |      0.31 |     0.30 |           29 |          15 |
|       1 | listeners |      0.65 |     0.31 |          675 |          15 |
|     100 | listeners |      8.74 |     1.54 |       41,956 |         433 |
|    1000 | listeners |    160.17 |    18.32 |      394,820 |         444 |
|       1 | computeds |      1.20 |     0.43 |          956 |          15 |
|     100 | computeds |     73.19 |    14.39 |       21,930 |         433 |
|    1000 | computeds |    738.15 |   165.38 |    1,395,590 |         444 |
|       1 | bindings  |      1.71 |     0.99 |        1,968 |           5 |
|     100 | bindings  |    104.30 |    59.34 |      119,987 |       3,280 |
|    1000 | bindings  |   1130.70 |   625.84 |    1,170,092 |      28,610 |
|       1 | steady    |      1.17 |     0.53 |        1,937 |          57 |
|     100 | steady    |     69.84 |    26.08 |      109,180 |         433 |
|    1000 | steady    |    797.96 |   262.09 |    1,061,428 |         444 |

- Before, every write allocated per reader: a closure per notification, a
  wrapper when a listener was queued twice, and a `Set`, an array and an
  object each time a binding or a computed ran again, which then diffed
  its subscriptions through another `Set`. Each queued listener was looked
  up with `includes` in its signal's list, so 1,000 listeners of one signal
  cost half a million comparisons per write.
- After, what a write allocates does not grow with its readers: about 440
  bytes with 100 readers or with 1,000. `test/runtime.test.ts` holds
  listeners and computeds under a kilobyte for 1,000 readers.
- What `bindings` still allocates per reader, about 28 bytes, is the prop
  each binding sends into the host batch, not the signal core (plan 2.1 and
  2.6). `steady`, whose bindings run again and send nothing, allocates
  nothing per reader.
- A `Text` whose children are an expression allocates per run as well: its
  binding joins the children into one string (`childText` in
  `src/runtime/plan-values.ts`), which these scenarios leave out by binding
  `opacity`.

## On a device

Pending: the device wave runs this on Hermes, release bytecode, on iOS and
Android, and Reel on both platforms before plan 2.2 counts as done there.
