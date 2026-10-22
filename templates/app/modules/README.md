# Native modules

This app's own native modules go here, one directory each, made by
`kuito module create <Name>`:

```text
modules/<name>/
  <name>.ts       the spec: defineModule('<Name>', { … }), its functions,
                  events and live values, and its native needs
  ios/*.swift     the class that conforms to the generated <Name>Spec
  android/*.kt    the class that implements the generated <Name>Spec
```

The app imports the spec (`import Battery from './modules/battery/battery'`),
and its shell compiles in only the functions the bundle calls. See Kuito's
`docs/native-modules.md`.
