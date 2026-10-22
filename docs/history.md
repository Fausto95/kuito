# History

Where Kuito started, kept for the record. Nothing here describes how Kuito
works today; the other docs do.

## Stage 0: feasibility

Stage 0 asked whether Hermes could carry a TSX framework at all, before any UI
work: could it run npm code as bytecode, keep state across bytecode patches in
one VM, and compile typed TypeScript ahead of time?

`research/probe.ts` still runs the probes that do not need a native host
(`node research/probe.ts all`, and `hermes-feasibility.yml` in CI); each
writes to `dist/stage0-results.json`.

| Probe          | What it really checks                                             | What it does NOT check               |
| -------------- | ----------------------------------------------------------------- | ------------------------------------ |
| `typed`        | Small typed TS subset accepted via `shermes -parse-ts -exec`      | General TypeScript support           |
| `aot`          | Untyped JS passes native AOT execution via `shermes -exec`        | Android/iOS builds or perf advantage |
| `bytecode`     | Hermes can emit and run HBC                                       | Persistent host or HMR               |
| `npm`          | Rolldown can bundle real lodash-es, generated JS executes in Node | Hermes compatibility                 |
| `npm-bytecode` | Bundled npm code runs as HBC                                      | AOT npm parity                       |

The week-one verdict rules were: if typed AOT fails but JS AOT and HBC succeed,
keep the core on bytecode and treat AOT as an optional optimization; if HBC runs
npm code but embedded hot patching isn't viable, stop UI work and rethink the
persistent VM; report a missing tool as `BLOCKED`, not `FAIL`; never claim a
React Native or Expo speedup without baseline measurements. Typed AOT stayed
experimental ([kill criteria](../research/kill-criteria.md)).

## The JavaScript reference model

Live Patch semantics were first pinned down by `src/live/runtime.ts`, a
JavaScript-only model with `state`, `on` and `bind`: a patch keeps signals by
key, replaces handlers and bindings, rolls back a registration that throws, and
refuses a module that claims another's handler. The kernel (`src/runtime`)
inherited those invariants (`test/hbc-kernel.test.ts`, `test/dev-session.test.ts`),
and the model, with its `on`/`bind` registration API, was deleted.

## The desktop engine

Before Hermes ran on the devices, `kuito dev --engine desktop` ran the app in
one persistent Hermes VM on the Mac (`native/hermes-host`, driven over stdio by
`src/dev/host.ts`). A Node mirror (`src/dev/mirror.ts`) replayed its view
operations to the iOS and Android shells over a loopback WebSocket, and the
shells sent presses back. The probes `probe:hbc-host`, `probe:live-loop`,
`probe:native-tree` and `probe:components` proved, in CI, that independently
compiled HBC units load into one VM with state retained, that TSX and lodash-es
compiled by Rolldown run there, and that a broken patch leaves the previous
version live.

The on-device engine replaced it: each shell embeds Hermes, the dev server
sends source patches, and DevTools, the inspector and native module selection
were only ever built for it. The desktop engine, its mirror, host and probes,
and the compiler's bytecode path were removed in Phase 19.

The on-device engine's Live Patch server also ran on its own,
`npm run dev:device`, with readable output, beside
`kuito dev`. Its device replay, `kuito replay`, applied a recording on a
shell that ran no app. Both went in the October 2026 review: `kuito dev` is
the one dev path, and recordings replay headlessly
([testing](testing.md#golden-tests)).

## The performance roadmap

After Stage 0, a roadmap planned the kernel, host-boundary and app-API work in
three tracks that could run in parallel, each phase with a failing test first
and a benchmark before and after:

- **Phase 0, measure first:** kernel and native counters and an Android frame
  baseline (`benchmarks/android/README.md`).
- **Track A, the kernel:** hook slots keyed by name instead of refusing a
  patch whose signature changed (Phase 1, #102 and #112); bindings and
  subscriptions kept across re-plans, then a changed branch re-planned alone
  (Phase 2, #123 and #126); per-path signals and keyed rows (Phase 7,
  `store()` in #181 and `For` in #183); and research spikes on the thread model
  (Phase 8).
- **Track B, the host boundary:** a prop manifest, numeric view ids and one
  typed batch per job (Phase 3, #129 and the typed renderer tables after it),
  a typed HTTP host (Phase 5) and module codegen (Phase 6).
- **Track C, signals-first app APIs:** props bound two ways to signals (#147),
  system state as signals, and tokens that follow the color scheme.

Later work numbered its phases afresh; each concern's doc describes what
shipped.

## Status table, as Stage 0 left it

| Area                                          | What existed                                         | Validation status then                                                                                            |
| --------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| TSX component API and Oxc transform           | `src/dev/component-transform.ts` + `src/ui`          | JavaScript tests; integration uses installed dependencies                                                         |
| Fine-grained signals, keyed native operations | `src/runtime/`                                       | Node isolated-VM tests pass                                                                                       |
| Persistent desktop Hermes and HBC patching    | `native/hermes-host`                                 | GitHub native probe passed                                                                                        |
| npm ecosystem experiment                      | `lodash-es` via Rolldown                             | Node + Hermes bytecode probes passed in CI                                                                        |
| UIKit/Android development shells              | `native/ios`, `native/android`                       | Pre-device-embedding CI compiled both shells                                                                      |
| On-device Hermes/JSI                          | `native/shared`, platform bridges                    | Dedicated JS worker + batched UI commits implemented in source; mobile build and device behavior still unverified |
| Static Hermes typed AOT                       | `research/experiments/typed.ts`, `research/probe.ts` | Experimental; CI attempts failed                                                                                  |
