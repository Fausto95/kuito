# One view's props in one commit (plan A)

What a commit costs the kernel as one view's props grow: a module of one
`VStack` whose 10, 50 or 200 object props all change, planned again. Each
write to a view's props journals its sent props so an aborted commit can
restore them (`src/runtime/transaction.ts`); a commit journals each entry
once, so the cost grows with the props written, not with their square.

## How it is taken

```bash
node scripts/benchmark-kernel.ts --case commit-props-200
```

- The `commit-props-<N>` cases of the kernel microbenchmarks
  (`benchmarks/kernel/README.md`): the `release` kernel in `node:vm`, with a
  host that drops its batches, 200 commits a round, the median of seven
  rounds after one to warm up.
- Before and after are the two kernels' scripts (`--out`), run alternately
  five times each so load on the host fell on both alike; the table holds
  the median of the five.
- Node's JIT, not Hermes: compare builds with each other, never these times
  with a device's. No device ran it.
- Host: Apple M3 Pro, macOS (Darwin 27.0.0), Node 24.16.0, 2026-10-22, with
  a load average between 35 and 56 from other builds: times move by tens of
  percent between runs.

## Result

Before: `main` at `4c1acad2`, which journals a view's sent props on every
prop write, a copy each. After: one journal per entry per commit.

| props | µs before | µs after | before ÷ after |
| ----: | --------: | -------: | -------------: |
|    10 |     117.2 |     73.5 |            1.6 |
|    50 |   1,315.0 |    201.7 |            6.5 |
|   200 |  13,794.9 |    986.0 |           14.0 |

Four times the props cost 10.5 times as much before and 4.9 times as much
after: the journal no longer grows with the square of the props written.
