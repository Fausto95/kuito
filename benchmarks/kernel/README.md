# Kernel microbenchmarks (plan 1.3)

What the kernel's hot paths cost, case by case: signal writes many bindings
or computeds follow, a keyed `For` reordered, a 1,000-view tree planned
from nothing and planned again unchanged, and one view whose 10, 50 or 200
props all change in one commit (`benchmarks/kernel-commit.md`).

## How it is taken

```bash
node scripts/benchmark-kernel.ts
```

- `cases.ts` is plain ES2022 over the kernel's globals and one clock:
  `scripts/benchmark-kernel.ts` bundles the kernel (`release` profile;
  `--profile dev` for the other) and `main.ts` into one script and runs it in
  `node:vm` with a host that drops the kernel's batches. Each case builds its
  app in a module of its own, times one operation per iteration over seven
  rounds after a warm-up round, and reports the median in microseconds; a
  write lands as app code's does, on the next microtask.
- `--case <name>` runs one case, `--rounds` and `--scale` change how long,
  `--json` prints JSON, and `--out <file>` writes the script for a device.
- Node's JIT, not Hermes: compare builds with each other, never these times
  with a device's. `test/benchmark-kernel.test.ts` keeps every case running.

## Result

`main` at `8e70fe85`, release kernel, Node 24.16.0 on an Apple M3 Pro
(macOS, Darwin 27.0.0), 2026-10-21, one run with a load average between 60
and 100 from other builds: a first reading to compare later runs with, not
a figure to quote.

| case                   | µs per iteration | what one iteration does                                 |
| ---------------------- | ---------------: | ------------------------------------------------------- |
| signal-1000-bindings   |            1,031 | one signal write that 1,000 Text opacities follow       |
| signal-1000-computeds  |              516 | one signal write that 1,000 subscribed computeds read   |
| reconcile-reverse-1000 |           16,383 | a keyed For of 1,000 rows reversed                      |
| reconcile-move-1000    |            7,148 | the last of 1,000 keyed rows moved to the front         |
| plan-mount-1000        |            6,163 | a module of 1,000 views planned, committed and disposed |
| plan-replan-1000       |            4,127 | a module of 1,000 views planned again unchanged         |

Moving one row of a 1,000-row `For` costs almost half of reversing all of
them: the reorder walks every row again, which plan 2.3's work did not reach.

## On a device

Pending. The script `--out` writes runs as it is on a shell's Hermes, given
three globals before it: `__kuitoBenchOptions` (JSON:
`{ rounds, only, scale }`), `__kuitoBenchNow()` in milliseconds, and
`__kuitoBenchReport(json)`, which receives `{ results }` or `{ error }` once
the cases settle. The device wave (plan 1.2) adds the shell side, on release
bytecode on an iPhone and an Android phone.

The plan also names a comparison with alien-signals. It is not here: it would
add a dependency, and `benchmarks/kernel-signals.md` already holds the signal
core's own numbers before and after its rewrite.
