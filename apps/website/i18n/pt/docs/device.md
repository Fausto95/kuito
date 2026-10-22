# device

O dispositivo em que a aplicação corre: factos fixos, lidos da plataforma uma vez, quando
a aplicação arranca, já que nada disto muda enquanto ela corre.

```tsx
import { device } from 'kuito';

device.model; // 'iPhone 16 Pro', 'Pixel 8'
device.type === 'tablet';
if (!device.physical) console.log('on a simulator');
```

| Propriedade    | iOS                                                          | Android                       |
| -------------- | ------------------------------------------------------------ | ----------------------------- |
| `physical`     | `false` no simulador                                         | `false` no emulador           |
| `brand`        | `Apple`                                                      | `Build.BRAND`, como `google`  |
| `manufacturer` | `Apple`                                                      | `Build.MANUFACTURER`          |
| `model`        | O nome comercial, ou `null` para um modelo ausente da tabela | `Build.MODEL`, como `Pixel 8` |
| `modelId`      | O identificador de hardware, como `iPhone17,1`               | `null`                        |
| `type`         | A partir do identificador: phone, tablet, desktop num Mac    | TV, PC, tablet a 600dp, phone |
| `memory`       | Bytes de memória física                                      | Bytes de memória física       |
| `osName`       | `iOS`, ou `iPadOS` num iPad                                  | `Android`                     |
| `osVersion`    | Como `26.0.1`                                                | `Build.VERSION.RELEASE`       |
| `osBuildId`    | Como `23A341`                                                | `Build.DISPLAY`               |
| `apiLevel`     | `null`                                                       | `Build.VERSION.SDK_INT`       |

`type` é um `DeviceType`: `'unknown'`, `'phone'`, `'tablet'`, `'desktop'` ou
`'tv'`. Uma aplicação que não lê nenhum destes nunca pergunta à plataforma.

Os nomes dos modelos iOS vêm de uma tabela, `KuitoDeviceModels.swift`, construída a partir dos
perfis de dispositivo do simulador do Xcode. Um modelo mais recente do que a tabela lê-se como
`null`; `modelId` está sempre presente. Não há nome do dispositivo: o iOS responde-lhe com
`iPhone` a menos que a aplicação tenha o entitlement da Apple para o nome de dispositivo atribuído pelo utilizador, e
`UIDevice` não pode ser lido fora da thread principal, onde `device` é lido.

A língua, o fuso horário e o relógio estão em [localization](localization.md), e
o modo escuro e o tamanho do texto do utilizador em [appearance](appearance.md): esses
mudam enquanto a aplicação corre, por isso são sinais.
