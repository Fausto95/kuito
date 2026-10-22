# Image decoding at display size

`demo/image-grid.tsx`: twelve 3000 × 2000 JPEGs from picsum.photos in
100-point squares, timed from the module's first line to the last `load`
([performance.md](../docs/performance.md#images)). Release builds, every run
after the first reading the photos from the disk cache, so the time is the
decode. Before is `main` at 4c1acad2, after is the change that decodes at
display size and keys the memory cache by URL and power of two.

No physical device was available: these come from a simulator and an
emulator on a shared, loaded host, so the times vary more than the memory.

| Scenario                    |   Before |    After | Device / OS / build                                                       |
| --------------------------- | -------: | -------: | ------------------------------------------------------------------------- |
| Peak footprint, median of 6 |  516 MiB |   61 MiB | iOS simulator, "iPhone 18 Pro" (iOS 27.0), Release, `phys_footprint_peak` |
| All 12 shown, median of 6   |   300 ms |   120 ms | same                                                                      |
| Peak RSS, median of 12      |  416 MiB |  199 MiB | Android emulator (API 34, arm64, 480 dpi), Release, `VmHWM`               |
| All 12 shown, median of 12  | 5,143 ms | 2,299 ms | same, two interleaved rounds of six                                       |

Ranges: iOS before 239–401 ms and 479–549 MiB, after 111–306 ms and
60–64 MiB. Android before 2,491–7,396 ms and 406–436 MiB, after
1,438–4,051 ms and 196–202 MiB.

Both screens are 3× (the emulator at 480 dpi), so a 100-point square is
300 pixels and each photo is divided by 4, to 750 × 500: 1.5 MB decoded
instead of 24 MB. Twelve full decodes alone are 288 MB; the old iOS peak
above that is most likely each `UIImage(data:)` and its
`preparingForDisplay()` copy alive at once while decoding. Android's peak
after the change still holds the runtime's heap and the bytes read from
disk.
