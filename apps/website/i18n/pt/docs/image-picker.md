# mediaPicker

O seletor de fotografias e a câmara do sistema, para imagens e vídeos:
`PHPickerViewController` e `UIImagePickerController` no iOS, o Photo
Picker (`PickVisualMedia`) e a aplicação de câmara do sistema no Android.

```tsx
import { Image, mediaPicker } from 'kuito';

const result = await mediaPicker.pick({ selectionLimit: 0, maxWidth: 1600 });

if (!result.canceled) photo.value = result.assets[0].uri;

<Image src={{ uri: photo.value }} aspectRatio={1.5} />;
```

`pick(options?)` e `capture(options?)` resolvem
`{ canceled: true, assets: null }` quando o utilizador fecha o seletor sem
escolher, e `{ canceled: false, assets }` caso contrário. Cada asset é:

| Campo      | Significado                                                                                |
| ---------- | ------------------------------------------------------------------------------------------ |
| `uri`      | Um URI `file://` no diretório de cache da aplicação. `<Image src>` e `fileSystem` leem-no. |
| `width`    | Em píxeis, na vertical: a orientação EXIF já está aplicada.                                |
| `height`   | Em píxeis, na vertical.                                                                    |
| `type`     | `'image'` ou `'video'`.                                                                    |
| `mimeType` | `image/jpeg` ou `image/png` para imagens; o tipo próprio do ficheiro para vídeos.          |
| `fileName` | O nome que a biblioteca lhe dá, com a extensão escrita (ver abaixo).                       |
| `fileSize` | Em bytes, do ficheiro em `uri`.                                                            |
| `duration` | Só vídeos, em milissegundos.                                                               |

| Opção            | Predefinição | Significado                                                                                     |
| ---------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| `mediaTypes`     | `'images'`   | `'images'`, `'videos'`, ou ambos como lista.                                                    |
| `selectionLimit` | `1`          | Só na biblioteca. Quantos assets o utilizador pode escolher; `0` para o limite do sistema.      |
| `quality`        | `1`          | Qualidade JPEG das imagens escritas, de 0 a 1.                                                  |
| `maxWidth`       | nenhum       | As imagens mais largas do que isto, em píxeis, são reduzidas para caber, mantendo a proporção.  |
| `maxHeight`      | nenhum       | O mesmo para a altura. Ambos em conjunto ajustam a imagem dentro da caixa.                      |
| `allowsEditing`  | `false`      | Só no iOS: o editor do sistema recorta a imagem (ou apara o vídeo) antes de a chamada resolver. |

Uma opção fora do seu intervalo lança um `TypeError` na chamada, antes de
qualquer seletor abrir: uma `quality` fora de 0 a 1, um `selectionLimit`
negativo ou fracionário, um `mediaTypes` desconhecido ou vazio, um tamanho que
não é um número positivo, ou `allowsEditing` com um `selectionLimit` diferente
de 1. `maxWidth` e `maxHeight` vão mais longe do que o Expo, que não
redimensiona.

## O que fica na cache

Os media escolhidos e capturados são escritos em `ImagePicker/` no diretório
de cache da aplicação (`fileSystem.cache`), fora da thread principal, um asset
a seguir ao outro:

- **As imagens são recodificadas.** Descodificadas no menor tamanho que cobre
  `maxWidth` e `maxHeight`, postas na vertical, e escritas como JPEG com a
  `quality`. Uma imagem com transparência é escrita como PNG em vez disso, e a
  `quality` não se aplica. Os metadados EXIF, localização incluída, não são
  copiados. O HEIC da biblioteca do iOS torna-se JPEG, pelo que o ficheiro
  funciona em todo o lado.
- **Os vídeos são copiados tal como estão.** Sem transcodificação; `width` e
  `height` têm em conta a rotação da faixa.

O sistema pode limpar a cache quando o armazenamento escasseia. Mova um asset
que a aplicação guarda para `fileSystem.documents` ([fileSystem](file-system.md)).

## Permissões

Escolher da biblioteca não precisa de permissão em nenhuma das plataformas:
ambos os seletores correm fora do processo e entregam apenas o que o utilizador
escolhe.

`capture` pede primeiro a permissão `camera` através de
[permissions](permissions.md) e rejeita com `ERR_PERMISSION` quando não é
concedida. No Android isso só acontece se a aplicação declarar a permissão de
câmara (`permissions: { camera: … }` em `kuito.config.ts`): a aplicação de
câmara do sistema não precisa de nenhuma, mas o Android recusa o intent a uma
aplicação que a declara sem a ter.

O módulo inclui `NSCameraUsageDescription` e `NSMicrophoneUsageDescription`
(o vídeo grava som) na sua spec, `native/modules/image-picker/image-picker.ts`. As razões
`permissions.camera` e `permissions.microphone` da aplicação substituem-nas.

## Diferenças entre plataformas

|                           | iOS                                 | Android                                                                                                  |
| ------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Biblioteca                | `PHPickerViewController`            | o Photo Picker; androidx.activity leva-o aos dispositivos que não o têm                                  |
| `allowsEditing`           | `UIImagePickerController`, um asset | rejeita com `ERR_UNSUPPORTED`: o Android não tem editor de sistema                                       |
| Câmara com ambos os tipos | a câmara oferece fotografia e vídeo | tira uma fotografia: a aplicação de câmara faz uma coisa ou a outra; peça `'videos'` sozinho para gravar |
| `fileName`                | o nome da biblioteca                | o nome do Photo Picker, que é o id do media (`1000000020.jpg`); o de uma captura é o do ficheiro         |
| Sem câmara                | `ERR_CAMERA_UNAVAILABLE`            | `ERR_CAMERA_UNAVAILABLE` quando nenhuma aplicação responde ao intent de captura                          |

Uma segunda chamada com um seletor aberto rejeita com `ERR_BUSY` no iOS.

No Android os seletores correm como outras atividades, iniciadas através de
`KuitoActivityResults` ([módulos nativos](native-modules.md)). A câmara
escreve num URI `content://` que o FileProvider próprio do módulo
(`KuitoImagePickerFileProvider`) concede só para a captura, no diretório
`ImagePicker/` da cache. Se o Android terminar a aplicação com um seletor
aberto, o resultado perde-se com o JavaScript que esperava por ele.

### Simuladores e emuladores

- O simulador do iOS (iOS 27) mostra a UI da câmara sem imagem: o obturador
  não faz nada, pelo que a captura só pode ser testada num dispositivo.
  Cancelar funciona. Os simuladores mais antigos não têm câmara de todo, e
  `capture` rejeita com `ERR_CAMERA_UNAVAILABLE`.
- A aplicação de câmara do emulador do Android captura fotografias da sua
  cena virtual. A gravação de vídeo pode deixar de responder (imagem da API
  34); a chamada resolve então `canceled`.
- `xcrun simctl addmedia <device> file…` e `adb push` mais uma análise de
  media colocam fotografias e vídeos nas bibliotecas.
