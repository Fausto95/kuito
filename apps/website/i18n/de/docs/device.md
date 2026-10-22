# device

Das Gerät, auf dem die App läuft: feste Fakten, einmalig von der Plattform gelesen, wenn
die App startet, da sich nichts davon während der Laufzeit ändert.

```tsx
import { device } from 'kuito';

device.model; // 'iPhone 16 Pro', 'Pixel 8'
device.type === 'tablet';
if (!device.physical) console.log('on a simulator');
```

| Eigenschaft    | iOS                                                                           | Android                        |
| -------------- | ----------------------------------------------------------------------------- | ------------------------------ |
| `physical`     | `false` auf dem Simulator                                                     | `false` auf dem Emulator       |
| `brand`        | `Apple`                                                                       | `Build.BRAND`, wie `google`    |
| `manufacturer` | `Apple`                                                                       | `Build.MANUFACTURER`           |
| `model`        | Der Marketingname, oder `null` für ein Modell, das nicht in der Tabelle steht | `Build.MODEL`, wie `Pixel 8`   |
| `modelId`      | Die Hardware-Kennung, wie `iPhone17,1`                                        | `null`                         |
| `type`         | Aus der Kennung: phone, tablet, desktop auf einem Mac                         | TV, PC, tablet ab 600dp, phone |
| `memory`       | Bytes an physischem Speicher                                                  | Bytes an physischem Speicher   |
| `osName`       | `iOS`, oder `iPadOS` auf einem iPad                                           | `Android`                      |
| `osVersion`    | Wie `26.0.1`                                                                  | `Build.VERSION.RELEASE`        |
| `osBuildId`    | Wie `23A341`                                                                  | `Build.DISPLAY`                |
| `apiLevel`     | `null`                                                                        | `Build.VERSION.SDK_INT`        |

`type` ist ein `DeviceType`: `'unknown'`, `'phone'`, `'tablet'`, `'desktop'` oder
`'tv'`. Eine App, die nichts davon liest, fragt die Plattform nie.

Die iOS-Modellnamen stammen aus einer Tabelle, `KuitoDeviceModels.swift`, erstellt aus
den Simulator-Geräteprofilen von Xcode. Ein Modell, das neuer ist als die Tabelle, wird als
`null` gelesen; `modelId` ist immer vorhanden. Es gibt keinen Gerätenamen: iOS beantwortet ihn mit
`iPhone`, sofern die App nicht Apples Entitlement für den vom Benutzer vergebenen Gerätenamen hat,
und `UIDevice` kann nicht außerhalb des Hauptthreads gelesen werden, wo `device` gelesen wird.

Die Sprache, die Zeitzone und die Uhr finden sich in [localization](localization.md), und
der Dunkelmodus und die Textgröße des Benutzers in [appearance](appearance.md): diese
ändern sich, während die App läuft, daher sind sie Signale.
