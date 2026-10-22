# Packaging a module

A native module another app can install is an npm package with its modules laid out as an app's `modules/` is, and one key in its `package.json` naming that directory.

**Use it for**

- Sharing a module between your apps.
- Publishing a module, such as a crash service adapter or a device API, for others.

```text
kuito-battery/
  package.json
  modules/battery/
    battery.ts                the spec
    ios/BatteryModule.swift
    android/BatteryModule.kt
```

```json
{ "name": "kuito-battery", "version": "1.0.0", "kuito": { "modules": "modules" } }
```

The spec is the manifest: there is no other JSON file, config plugin or linking step to keep in step with it. Write the module as an app's own first ([Native modules](./native-modules.md)), then move its directory into the package.

## Use a packaged module

Add the package to the app's `dependencies`, and import its spec, or a namespace the package exports, as the app imports its own:

```tsx partial
import { Text } from 'kuito';
import Battery from 'kuito-battery/modules/battery/battery';

export function BatteryLevel() {
  return <Text>{Battery.charging.value ? 'Charging' : 'On battery'}</Text>;
}
```

- The CLI reads the `kuito.modules` key only of packages in the app's own `dependencies`. A packaged spec the app imports without listing its package is an error.
- A module is in the shell only when the bundle calls it, as an app's own module is: installing a package costs nothing until the app uses it.
- Two modules of one name, or two specs that declare one type name, fail the build naming both files.
- A packaged spec requires another package's by its package name: `import 'kuito-permissions/modules/permissions/permissions'`.

## What a package ships

- Sources only: the specs and the Swift and Kotlin are compiled with the app's shell. There are no prebuilt binaries.
- The package's other TypeScript is bundled as any package's is, without Kuito's component and UI-thread passes. Keep it to the spec and plain functions over it.
- Adding a package rebuilds the shell once, as adding an app module does.

## Related

- [Native modules](./native-modules.md): writing the spec and the native classes
- [Crash reports](./crash-reports.md#send-reports-to-a-service): an adapter is a module
- [Native modules in depth](../../../../docs/native-modules.md#ship-a-module-in-a-package)
- [Module packaging in depth](../../../../docs/module-packaging.md): why the shell names no module
