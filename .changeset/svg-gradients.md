---
'@kuito/kuito': minor
---

SVG images with linear and radial gradients now draw on Android: the build
converts them into the VectorDrawable's own gradients, where it rejected them
before. On iOS, SVG and PDF images are drawn sharp at every size again: the
asset catalogs Kuito generates carry Xcode's `preserves-vector-representation`
key, which the project rename had broken.
