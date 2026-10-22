# device

L'appareil sur lequel l'application s'exécute : des faits fixes, lus une seule fois sur la plateforme, au
démarrage de l'application, puisque rien de tout cela ne change pendant qu'elle tourne.

```tsx
import { device } from 'kuito';

device.model; // 'iPhone 16 Pro', 'Pixel 8'
device.type === 'tablet';
if (!device.physical) console.log('on a simulator');
```

| Propriété      | iOS                                                            | Android                        |
| -------------- | -------------------------------------------------------------- | ------------------------------ |
| `physical`     | `false` sur le simulateur                                      | `false` sur l'émulateur        |
| `brand`        | `Apple`                                                        | `Build.BRAND`, comme `google`  |
| `manufacturer` | `Apple`                                                        | `Build.MANUFACTURER`           |
| `model`        | Le nom commercial, ou `null` pour un modèle absent de la table | `Build.MODEL`, comme `Pixel 8` |
| `modelId`      | L'identifiant matériel, comme `iPhone17,1`                     | `null`                         |
| `type`         | D'après l'identifiant : phone, tablet, desktop sur un Mac      | TV, PC, tablet à 600dp, phone  |
| `memory`       | Octets de mémoire physique                                     | Octets de mémoire physique     |
| `osName`       | `iOS`, ou `iPadOS` sur un iPad                                 | `Android`                      |
| `osVersion`    | Comme `26.0.1`                                                 | `Build.VERSION.RELEASE`        |
| `osBuildId`    | Comme `23A341`                                                 | `Build.DISPLAY`                |
| `apiLevel`     | `null`                                                         | `Build.VERSION.SDK_INT`        |

`type` est un `DeviceType` : `'unknown'`, `'phone'`, `'tablet'`, `'desktop'` ou
`'tv'`. Une application qui ne lit aucune de ces propriétés n'interroge jamais la plateforme.

Les noms de modèles iOS viennent d'une table, `KuitoDeviceModels.swift`, construite à partir
des profils d'appareils du simulateur de Xcode. Un modèle plus récent que la table se lit
`null` ; `modelId` est toujours présent. Il n'y a pas de nom d'appareil : iOS y répond par
`iPhone` à moins que l'application ait l'entitlement Apple de nom d'appareil défini par l'utilisateur, et
`UIDevice` ne peut pas être lu hors du thread principal, là où `device` est lu.

La langue, le fuseau horaire et l'horloge sont dans [localization](localization.md), et
le mode sombre et la taille de texte de l'utilisateur dans [appearance](appearance.md) : ceux-là
changent pendant que l'application tourne, ce sont donc des signaux.
