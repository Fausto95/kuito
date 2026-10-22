# Architecture decision record 0001 — Decouple execution backends

Status: **accepted**

## Decision

1. Kuito owns TSX lowering, binding metadata, stable component identities, native view lifecycle and Live Patch compatibility rules.
2. **Development:** a persistent Hermes runtime inside each native shell runs the app and takes Live Patches as source ([history](history.md) has the Stage 0 models that came first).
3. **Production AOT:** Static Hermes is a separately measured backend. Where the typed language subset is supported, preserve type syntax on the path to `shermes -parse-ts`; do not run an unconditional Oxc TS-strip transform first.
4. **Dependencies:** Rolldown resolves and bundles unmodified npm packages; Oxc is the basis for Kuito-specific TSX/reactive transforms. Normal untyped npm JavaScript must still be handled.
5. Define host APIs and UI mutation IR independently of Hermes so we can replace a backend without redesigning rendering.

## Ownership and safety

- A native host must not retain raw JS closure pointers across patches. Store handler IDs, resolve on invocation.
- State identity must not depend on source line numbers or call order. Each hook's slot is keyed by its component instance and the name the compiler gives it ([reactivity](reactivity.md)).
- Patch preparation must be side-effect constrained. Native writes are not automatically reversible; transactional swaps need a staging/reconciliation policy.
- Hermes ABI and bytecode version compatibility must be pinned to an exact toolchain revision.
- On iOS, development refresh may load interpreted bytecode, but native AOT code changes require a rebuild; this is not an unrestricted native OTA mechanism.

## Open questions

- What bytecode unit/module loading APIs are available for the **chosen** Hermes revision in a persistent host?
- Can old and new code coexist during patch preparation and when is safe disposal possible?
- How are module imports/exports, package-level singletons and native references represented across patches?
- Can typed Kuito code and untyped bundled npm packages coexist under native AOT with observable parity?
- Do compiler lowering and bundling preserve the annotations that make typed AOT valuable?

## Sources

- https://github.com/facebook/hermes/blob/static_h/doc/TypedLanguage.md
- https://github.com/facebook/hermes/blob/static_h/doc/BuildingAndRunning.md
- https://github.com/facebook/hermes/blob/static_h/doc/blog/2025-11-02-hermes-compilation-runtime-modes.md
- https://rolldown.rs/apis/plugin-api
