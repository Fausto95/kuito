# Share a native module

Package a native module when several apps need the same platform integration. First implement and test it inside one app, following [write a native module](native-modules.md).

## Arrange the package

```text
kuito-battery/
  package.json
  modules/battery/
    battery.ts
    ios/BatteryModule.swift
    android/BatteryModule.kt
```

Point `kuito.modules` at the source directory and include that directory in the published package:

```json
{
  "name": "kuito-battery",
  "version": "1.0.0",
  "files": ["modules"],
  "kuito": { "modules": "modules" },
  "exports": { "./battery": "./modules/battery/battery.ts" }
}
```

The TypeScript spec is also the native manifest: it declares platform classes, dependencies, permissions and resources. Ship TypeScript, Swift and Kotlin sources. They compile with each consuming app's native shell; do not replace them with prebuilt binaries.

## Install it in an app

```sh
npm install kuito-battery
```

The package name above is illustrative; replace it with the package you publish. Add it to the app's direct `dependencies`, then import its exported spec. Calling a member includes the module in the native build. An installed package with no used module adds no native module to the shell.

Package TypeScript receives normal bundling but not Kuito's app component/UI-thread transforms. Export specs and plain helper functions; put app components in the app's source.

## Check before publishing

Run `npm pack --dry-run` to inspect the published files. Test the packed package in a separate app and build both platforms. Check that all native sources, resources and referenced specs are present.

Module names and generated type names must be unique across the app. Duplicate names fail with both source paths. A packaged spec that depends on another package must import it by package name, and the consuming app must declare the packages it uses.

Changing a module's native contract requires a shell rebuild. [Over-the-air updates](updates.md) cannot add or replace native modules.
