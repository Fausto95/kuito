# Taffy flexbox fixtures

`flex/` holds the flexbox layout fixtures of [Taffy](https://github.com/DioxusLabs/taffy)
at commit [`e82f526`](https://github.com/DioxusLabs/taffy/tree/e82f52682b6048d934a51af59681bd7aecc1671e/tests/xml/flex),
copied unchanged under Taffy's MIT license (see `LICENSE`). Each fixture is a
tree of styled boxes with the layout Chrome computes for it.

Kuito's layout engine (`native/shared/layout`) is a C++ port of Taffy's
flexbox algorithm; `test/flex-conformance.test.ts` runs every fixture through
it and compares the result with Chrome's. Fixtures that need block or grid
layout or vertical writing modes, which Kuito does not have, are skipped.

To update, copy `tests/xml/flex` from a newer Taffy commit and update the
commit above.
