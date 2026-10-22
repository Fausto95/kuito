# device

The device the app runs on: fixed facts, read from the platform once, when
the app starts, since none of it changes while it runs.

```tsx
import { device } from 'kuito';

device.model; // 'iPhone 16 Pro', 'Pixel 8'
device.type === 'tablet';
if (!device.physical) console.log('on a simulator');
```

| Property       | iOS                                                        | Android                        |
| -------------- | ---------------------------------------------------------- | ------------------------------ |
| `physical`     | `false` on the simulator                                   | `false` on the emulator        |
| `brand`        | `Apple`                                                    | `Build.BRAND`, as `google`     |
| `manufacturer` | `Apple`                                                    | `Build.MANUFACTURER`           |
| `model`        | The marketing name, or `null` for a model not in the table | `Build.MODEL`, as `Pixel 8`    |
| `modelId`      | The hardware identifier, as `iPhone17,1`                   | `null`                         |
| `type`         | From the identifier: phone, tablet, desktop on a Mac       | TV, PC, tablet at 600dp, phone |
| `memory`       | Bytes of physical memory                                   | Bytes of physical memory       |
| `osName`       | `iOS`, or `iPadOS` on an iPad                              | `Android`                      |
| `osVersion`    | As `26.0.1`                                                | `Build.VERSION.RELEASE`        |
| `osBuildId`    | As `23A341`                                                | `Build.DISPLAY`                |
| `apiLevel`     | `null`                                                     | `Build.VERSION.SDK_INT`        |

`type` is a `DeviceType`: `'unknown'`, `'phone'`, `'tablet'`, `'desktop'` or
`'tv'`. An app that reads none of these never asks the platform.

iOS model names come from a table, `KuitoDeviceModels.swift`, built from
Xcode's simulator device profiles. A model newer than the table reads as
`null`; `modelId` is always there. There is no device name: iOS answers it with
`iPhone` unless the app has Apple's user-assigned device name entitlement, and
`UIDevice` can't be read off the main thread, where `device` is read.

The language, time zone and clock are in [localization](localization.md), and
the user's dark mode and text size in [appearance](appearance.md): those
change while the app runs, so they are signals.
