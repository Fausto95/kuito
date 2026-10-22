# Kuito

A native UI framework: TypeScript components run on Hermes and drive real UIKit and
Android Views through a C++ mutation queue. Fine-grained signals, CSS styles compiled
at build time, motion and gestures as declarations, Live Patch.

## Map

| Path                           | What lives there                                                              |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `src/ui`, `src/native`         | Public app API: primitives, signals, flow, animations. App code.              |
| `src/runtime`                  | The kernel Hermes runs: plan, patch, events, signals. One module per concern. |
| `src/ui-thread`                | The UI-thread kernel: motion bindings and handlers next to the views.         |
| `src/protocol`                 | The manifest: every kind, prop and event, generated into each layer.          |
| `src/dev`, `src/style`         | Dev server, Rolldown compiler, Hermes host, mirror, CSS compiler.             |
| `src/cli`                      | `kuito` CLI: Ink session UI, devices, builds, crash reports.                  |
| `src/tests`, `native/headless` | `kuito/tests`: the headless host apps' tests run on, its C++ in WebAssembly.  |
| `native/shared`                | C++ runtime: Hermes, `MutationQueue`, frame scheduler, layout engine.         |
| `native/ios/Renderer`          | UIKit renderer. `native/ios/App` is the shell app only.                       |
| `native/android/.../renderer`  | Android Views renderer. The activity is the shell only.                       |
| `demo/`                        | Reel, an app of its own (`kuito.config.ts`, `file:..`); other demos too.      |
| `research/`                    | Stage 0 probes and inputs, kill criteria, unbuilt contracts. Not product.     |
| `docs/`                        | Behavior docs. `docs/events.md`, `styles.md`, `motion.md`, ...                |

## Commands

- `npm test` — Vitest via Vite+. Every test passes on `main`; anything failing is yours.
- `npm run lint` — Oxlint with type-aware rules **and** TypeScript diagnostics; warnings fail.
  It covers `apps/website`, which needs `npm ci --prefix apps/website` and one
  `npm --prefix apps/website run build` (generated route tree and content) first.
- `npm run fmt` — Oxfmt. Run before committing.
- `npm run changeset` — a PR users will notice adds a changeset; releases are cut from them
  (`CONTRIBUTING.md#releases`).
- `node scripts/check-package.ts` — packs the npm package, installs it, creates an app with it
  and runs that app's tests. Run it after changing `files`, dependencies, `bin/`, or how Kuito
  starts a Node process: a checkout runs from outside `node_modules` and hides those breaks.
- C++ in `native/shared` follows `native/shared/.clang-format`: `npx clang-format -i` the files you
  change. `test/native-format.test.ts` fails on a file that doesn't.
- `node scripts/build-headless-wasm.ts` — rebuilds `native/headless/headless.wasm` after a change to
  the C++ it holds (`native/shared/layout`, `Wire.h`, `ViewTable`); `test/headless-layout.test.ts`
  fails until it does.
- `npm run generate` — rewrites the `*.generated.*` files and docs tables from
  `src/protocol/` and the style compiler's table. Change those, never the generated files.
- `npm run demo:ios -- --device "iPhone 18 Pro"` — build, launch, Live Patch Reel (`demo/`).
  `kuito` runs the app in its working directory and fails without a `kuito.config.ts`;
  the root is not an app. `--entry <file>` is relative to `demo/` (`--entry navigation.tsx`).
  `demo:android` for Android.
- iOS renderer tests (`native/ios/Tests`, a simulator unit-test bundle without the shell):
  `xcodegen generate --spec native/ios/tests.yml`, then
  `xcodebuild test -project native/ios/KuitoRendererTests.xcodeproj -scheme KuitoRendererTests -destination 'platform=iOS Simulator,name=iPhone 18 Pro'`.
- Android renderer tests (`native/android/app/src/androidTest`, on a running emulator):
  `node scripts/test-android.ts`, with the Android environment below.
- Android builds need JDK 21 and Gradle 8: `JAVA_HOME=$(/usr/libexec/java_home -v 21)`,
  `ANDROID_HOME=~/Library/Android/sdk`, `PATH=/opt/homebrew/opt/gradle@8/bin:$PATH`.

Use Vite+ (`vp`) for anything it covers — test, lint, format, type-check. Don't add
another tool for a job `vp` already does.

## Architecture rules

- Layers depend one way: `ui` (API) → `runtime` (kernel) → host boundary → C++ → renderers.
  The kernel knows nothing about UIKit or Android; renderers know nothing about JSX.
- One typed batch per job crosses the host boundary: `__kuitoHostCommit` with an
  ArrayBuffer of records, views by number, decoded and validated once in C++
  (`docs/native-scheduling.md`). Structured values still cross as JSON strings; events
  cross as `(handle, event, payload)` with a JSON payload (see `docs/events.md`).
- Renderers keep one shape on both platforms: `Kuito*Renderer` owns the view tree,
  `KuitoViewFactory` makes views and wires events, `properties/` holds one table per
  concern keyed by prop name, `styling/` holds per-view state. Add a prop to
  `src/protocol/manifest.ts`, then an entry to the table that owns its concern — never a new
  branch in the renderer. `test/protocol-parity.test.ts` holds both renderers to the manifest.
- A prop or feature lands on **both** iOS and Android in the same change, or the docs
  say which platform lacks it.
- Declarative over imperative: lookup tables and data over `switch`/`if` ladders.
- State lives in one place. Per-view native state belongs on that view's style object,
  not in parallel renderer maps keyed by id.
- One file, one concern. When a file mixes concerns or a function needs a comment to
  separate its phases, split it.

## TypeScript

- Node runs `src/cli`, `src/dev`, `src/style`, `scripts`, `test` directly (type
  stripping): relative imports name the `.ts` file, and only erasable syntax is allowed —
  no `enum`, `namespace`, or constructor parameter properties.
- App code (`src/ui`, `src/native`, `demo`) is bundled: imports are extensionless.
  The kernel (`src/runtime`) is bundled too. `tsconfig.node.json`, `tsconfig.app.json` and
  `tsconfig.runtime.json` enforce this; the kernel shares only `src/ui/globals.d.ts` with apps.
  Tests resolve like a bundler (`tsconfig.test.json`) to see the kernel's types; a lint rule
  keeps their relative imports naming the `.ts` file. Kernel declarations of standard globals
  live in `src/runtime/standard-globals.d.ts`, which no module imports, so they stay out of tests.
- No `any`. Use `unknown` and narrow; if an assertion is unavoidable, `as never`.
  No `@ts-ignore` / `@ts-expect-error`. Validate untrusted data (JSON, protocol
  messages, native payloads) at the boundary instead of asserting its shape.
- Encode invariants in types; prefer exhaustive `switch` over a default branch so a new
  case fails to compile.
- Public names describe Kuito's model and come from `docs/naming.md`, never from
  React Native, Expo or Reanimated for familiarity. A reader who knows none of them
  should guess the behavior from the name. A new public name gets a row there first.

## React and state (CLI UI)

- Assume the React Compiler: no `useMemo`, `useCallback` or `memo` for reference
  stability. Read stores through narrow, `Object.is`-stable selectors.
- Stores own their framework binding and nothing else; derived state is recomputed by
  one reducer, not by ad-hoc updates in handlers.

## Native code

- Swift: `@MainActor` for anything touching UIKit. No force unwraps outside tests.
- Kotlin: UI-thread only in renderers. No `!!`.
- C++: no exceptions crossing JSI without a catch that discards the batch.
- Invalid props are errors, not silent no-ops: throw `unsupportedValue` from the setter
  (`KuitoRenderError`, `docs/native-renderer.md#errors`).

## Errors

- Fail fast with one error path. Invalid state throws; callers decide the fallback.
- Errors say what failed, where (file:line when the user's code caused it), and what to
  do next. Route them through the reporting seam (`reportError`, the CLI reporter), not
  scattered `console.error` or swallowed catches. On a device, console output and
  uncaught errors reach the LogBox through `__kuitoHostLog` (`docs/logbox.md`); a shell
  failure goes through its one `failed` function.

## Comments

- Comments explain why — invariants, platform quirks, constants nobody should tune
  blindly. Delete comments that restate the code, and any comment your change makes false.
- Write for a reader at HEAD: no history of the bug, no "previously", no session notes.
- English only.

## Tests

- TDD: write the failing test, watch it fail, then implement. The test commit comes
  before the implementation commit.
- A bug fix includes a test that fails without the fix.
- Pure logic is tested without the framework; kernel behavior through `test/support`
  (`installKernel`). Add to the existing test file for the code you change.
- Intent-revealing and robust: scope with `within()` rather than scattering test ids; no
  positional assertions (`at(-1)`) that a reorder silently breaks.
- Never wait with `setTimeout`/sleep for a condition; await the event or poll with a
  deadline.

## Commits and PRs

- Conventional Commits, imperative, title ≤ 50 chars, describing what the change
  brings. Body wrapped at 72 explains why and the alternatives considered.
- Atomic commits; plan the sequence before coding. Docs change in the same commit as
  the behavior they describe.
- Never add Co-Authored-By trailers or AI attribution to commits or PRs.
- Pull `main` before opening a PR. PRs are squash-merged.
- A PR says exactly which checks ran (commands, device, OS) and which could not.
- Never stage unrelated local changes (e.g. a personal `.gitignore` edit).

## How to work here

- Verify before asserting: cite a file and line or a command you ran. If you didn't run
  it, say so — never report work as done or verified when it wasn't.
- Run the narrowest relevant check first, then `npm test` and `npm run lint` before any
  commit. UI changes are checked on a simulator, not only by compiling.
- Fix the root cause. If a workaround needs a paragraph to justify it, fix the design.
- Look for an existing helper before writing a new one. Don't add dependencies unless
  asked.
- Keep changes focused: no drive-by refactors, reformatting or dependency bumps.
- Never revert or overwrite changes you did not make.

## Gotchas

- `native/shared/layout` is a port of Taffy's flexbox: keep it faithful (same steps,
  same comments) and credit Taffy in every ported file. `test/flex-conformance.test.ts`
  runs Taffy's fixtures; a layout change that breaks one is a bug in the port.

- iOS has no CocoaPods: Hermes is a local Swift package. The CLI unpacks Maven's
  `hermes-ios` tarball, checked against `iosSha256`, into `~/.cache/kuito/hermes-ios-<version>`
  (a release build: the release tarball, `iosReleaseSha256`, `hermes-ios-<version>-release`)
  and the generated XcodeGen spec depends on it (`src/cli/hermes-ios.ts`). Modules add
  Swift packages, never pods.
- Both platforms run the same Hermes V1 release, pinned once in `native/hermes.json`
  (CLI, Gradle and CI read it; `test/hermesc.test.ts` checks them). Shells start
  from bytecode compiled by that release's `hermesc`. Android's vendored JSI
  (`native/android/app/src/main/cpp/jsi`) moves with the pin.
- App bundles, the kernel and UI-thread code target ES2022: classes and `async` run
  natively. Hermes V1 rejects async generators, so don't use them.
- Simulator taps from automation need a press duration (~0.2s) or UIKit ignores them.
- App code never names a thread (`docs/placement.md`): the compiler emits UI-thread copies
  and the kernel places them. Don't add `'worklet'`-style annotations or `runOnJS`.
- The kernel (`src/runtime`) is bundled by `src/dev/kernel.ts` into one ES2022 script,
  `dist/kernel/bootstrap.js`; tests build it once (global setup) and evaluate it in a
  `node:vm` context through `test/support/kuito-host.ts`. Kernel state lives only in
  `src/runtime/state/`, one module per concern; no other module keeps a copy.
