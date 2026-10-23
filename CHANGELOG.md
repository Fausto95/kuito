# @kuito/kuito

## 0.1.0

### Minor Changes

- 166bbc2: `kuito create` starts an app on file routes or component routes: it asks, or
  takes `--routes files|components`. File routes are an `app/` directory whose
  files are the routes; component routes declare them as `<Router>`, `<Tabs>`,
  `<Tab>` and `<Route>` in `app.tsx`, with the same starter screens under
  `screens/`.
- e9b023a: SVG images with linear and radial gradients now draw on Android: the build
  converts them into the VectorDrawable's own gradients, where it rejected them
  before. On iOS, SVG and PDF images are drawn sharp at every size again: the
  asset catalogs Kuito generates carry Xcode's `preserves-vector-representation`
  key, which the project rename had broken.

### Patch Changes

- 5708cf9: `kuito test` runs on Node 22.18, the oldest Node Kuito supports: the headless host's WebAssembly no longer needs exnref, which Node 22 lacks.

## 0.0.1

### Patch Changes

- 1525a32: The first public release: the `kuito` CLI, the `kuito`, `kuito/config` and
  `kuito/tests` modules, and the iOS and Android shells they build.
