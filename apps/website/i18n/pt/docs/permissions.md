# permissions

`permissions` verifica e pede permissões de runtime com um único modelo de estados no
iOS e no Android. Os módulos que precisam de acesso ao dispositivo (Camera, Location, Image
Picker, gravação de áudio, Notifications) pedem através dele nativamente, pelo que um estado
significa o mesmo em todos os módulos.

```tsx
import { app, permissions } from 'kuito';

const { status, canAskAgain } = await permissions.check('camera');

if (status === 'undetermined') await permissions.request('camera');
else if (status === 'denied' && !canAskAgain) await app.openSettings();
```

| Função          | Faz                                                                            |
| --------------- | ------------------------------------------------------------------------------ |
| `check(name)`   | Resolve com o estado atual sem mostrar nenhum pedido.                          |
| `request(name)` | Mostra o pedido do sistema, se o sistema o permitir, e resolve com a resposta. |

`check` e `request` resolvem com `{ status, canAskAgain }`:

| `status`       | Significado                                                                |
| -------------- | -------------------------------------------------------------------------- |
| `granted`      | A app tem acesso.                                                          |
| `limited`      | O utilizador permitiu parte dele: uma seleção de fotografias.              |
| `denied`       | O utilizador disse não, ou uma política (controlo parental, MDM) proíbe-o. |
| `undetermined` | A app ainda não pediu. `request` vai mostrar o pedido.                     |

`canAskAgain` é `false` quando `request` já não consegue mostrar o pedido. Só
o utilizador pode então mudar a resposta, nas Definições: envie-o para lá com
[`app.openSettings()`](app-state.md). Quando é `true`, `request` ou mostra o pedido ou responde de
imediato com um estado que não precisa de pedido (`granted`).

Um nome desconhecido rejeita com `ERR_ARGUMENT`.

## Nomes das permissões

| Nome             | iOS                                                    | Android                                                                       |
| ---------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `camera`         | `AVCaptureDevice` (vídeo)                              | `CAMERA`                                                                      |
| `microphone`     | `AVCaptureDevice` (áudio)                              | `RECORD_AUDIO`                                                                |
| `photos`         | `PHPhotoLibrary`, leitura e escrita                    | `READ_MEDIA_IMAGES` + `READ_MEDIA_VIDEO` (13+), `READ_EXTERNAL_STORAGE` (≤12) |
| `location`       | Durante a utilização (`requestWhenInUseAuthorization`) | `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION`                             |
| `locationAlways` | Sempre (`requestAlwaysAuthorization`)                  | `location`, depois `ACCESS_BACKGROUND_LOCATION` (10+)                         |
| `notifications`  | Alertas, distintivos e sons                            | `POST_NOTIFICATIONS` (13+), o interruptor de notificações da app (≤12)        |

`locationAlways` é a localização enquanto a app está em segundo plano, para
[atualizações em segundo plano](location.md#background-updates). Pede `location`
primeiro quando a app ainda não a tem: o iOS oferece "durante a utilização" no mesmo
pedido, e o Android 11 e posteriores só aceitam o acesso em segundo plano depois de o acesso em primeiro
plano estar concedido, pelo que `request` mostra o pedido de primeiro plano, e depois o de
segundo plano (o do Android é a página de localização da app nas Definições). No
Android 9 e anteriores, `locationAlways` é `location`.

## Diferenças em relação ao Expo

O Kuito segue os estados do Expo e o seu `canAskAgain`, com estas diferenças
deliberadas:

- **Um único módulo, nomes como argumentos.** O Expo espalha as permissões por cada
  módulo (`Camera.requestCameraPermissionsAsync()`). O Kuito tem um único
  módulo `permissions`, e os módulos de dispositivo usam-no nativamente. O código da app
  não precisa de importar a câmara para pedir a câmara.
- **`limited` é um estado.** O Expo reporta uma seleção de fotografias como `granted` com
  `accessPrivileges: 'limited'`. Uma concessão parcial comporta-se de forma diferente de uma
  completa, pelo que o Kuito faz dela um estado próprio.
- **Sem booleano `granted` e sem `expires`.** `status === 'granted'` diz o
  mesmo. As permissões de runtime não expiram.
- **A localização aproximada e as notificações provisórias são `granted`,** como no
  Expo. [Location](location.md) reporta a precisão no
  `coords.accuracy` de cada posição; é uma propriedade da posição, não da permissão.

## Notas de plataforma

- **O iOS pede uma vez.** Depois de uma recusa, `canAskAgain` é `false` e só
  as Definições o podem mudar. O acesso `limited` às fotografias mantém `canAskAgain: true`.
- **O Android pode voltar a pedir depois de uma recusa.** A segunda recusa é definitiva
  (`canAskAgain: false`). O Android reporta "nunca pedido" e "recusado de vez"
  da mesma forma, pelo que o Kuito memoriza que permissões já pediu. Um caso
  escapa, tal como no Expo: fechar o pedido sem responder,
  ou fechar o seletor de fotografias do Android 14 sem escolher, lê-se como uma recusa
  definitiva, embora o Android voltasse a pedir.
- **As fotografias selecionadas no Android 14** são `limited`. Pedir `photos` de novo
  mostra o pedido para que o utilizador possa mudar a seleção.
- **O iOS oferece "sempre" uma vez.** Com "durante a utilização" concedido, `locationAlways`
  é `undetermined` até `request` oferecer a passagem ao nível seguinte, e `denied` com
  `canAskAgain: false` depois de o utilizador manter "durante a utilização". A partir de um
  estado indeterminado, escolher "Permitir ao utilizar a app" dá o "sempre"
  provisório do iOS: `granted`, até o iOS voltar a perguntar ao utilizador na primeira
  vez que a app usar a localização em segundo plano.
- **O Android 12 e anteriores não têm permissão de notificações.** `notifications`
  é `granted` quando as notificações da app estão ligadas, e caso contrário `denied`
  com `canAskAgain: false`.

## Declará-las em kuito.config.ts

Uma app lista as permissões que usa em [`kuito.config.ts`](apps.md#kuitoconfigts),
cada uma com o motivo que o iOS mostra no seu pedido:

```ts
export default {
  name: 'Reel',
  ios: { bundleIdentifier: 'com.example.reel' },
  android: { applicationId: 'com.example.reel' },
  permissions: {
    camera: 'Scan tickets at the door.',
    location: 'Find screenings near you.',
    notifications: true,
  },
} satisfies KuitoConfig;
```

A CLI escreve exatamente isto nas shells que gera:

- **iOS**: cada motivo sob a sua chave do `Info.plist`: `NSCameraUsageDescription`,
  `NSMicrophoneUsageDescription`, `NSPhotoLibraryUsageDescription`,
  `NSLocationWhenInUseUsageDescription`,
  `NSLocationAlwaysAndWhenInUseUsageDescription` ou
  `NSFaceIDUsageDescription`.
  As notificações não têm motivo, pelo que o seu valor é `true`.
- **Android**: as permissões de runtime da tabela acima, mais
  `USE_BIOMETRIC` para `biometrics`, num manifesto em
  `.kuito/android/AndroidManifest.xml` que o Gradle funde por cima do da
  framework (`kuito.manifest`).

`biometrics` é apenas uma declaração, não um nome que `check` ou `request`
aceitem: o sistema pede o Face ID na primeira vez que o
[`secureStore`](secure-store.md#authentication) o usa.

Uma permissão que a configuração não declara não pode ser concedida. O iOS termina uma app
que pede sem texto de utilização, por isso declare antes de chamar `request`.
O Android recusa uma permissão não declarada sem mostrar nenhum pedido. Um nome
mal escrito ou um motivo vazio falha a build com um erro que nomeia a chave.

`locationAlways` precisa de `location` declarada também: o iOS mostra o motivo de "durante a
utilização" primeiro. Declará-la também liga as
[atualizações de localização em segundo plano](location.md#background-updates).

A app de demo deste checkout declara todas as permissões, para que cada demo possa pedir
a sua (`demo/kuito.config.ts`). Abrir `native/android` no Android
Studio sem a CLI constrói-a sem nenhuma.

## A partir de outro módulo

Um módulo que precisa de uma permissão pede através do helper nativo e não
chama a API do sistema por si próprio:

```swift
// iOS. Call on the main thread; the completion runs there too.
KuitoPermissions.request(.camera) { response in
    guard response.status == .granted else {
        return promise.reject("ERR_PERMISSION", "Camera access is \(response.status.rawValue)")
    }
    // …
}
```

```kotlin
// Android. Call on the main thread; the completion runs there too.
KuitoPermissions.request(context.activity, KuitoPermission.CAMERA) { response ->
    if (response.status != KuitoPermissionStatus.GRANTED)
        return@request promise.reject("ERR_PERMISSION", "Camera access is ${response.status.wire}")
    // …
}
```

Para acrescentar uma permissão, acrescente o seu nome a `PermissionName` em
`src/native/permissions.ts`, um case a `KuitoPermission` e uma fonte à
tabela em `KuitoPermissions.swift`, e uma linha a `KuitoPermission.kt`. Depois
torne-a declarável: uma chave em `KuitoPermissions` (`src/cli/kuito-config.ts`)
com a sua verificação, a sua chave do `Info.plist` e as entradas de manifesto na tabela em
`src/cli/shells.ts`, e um motivo em `demo/kuito.config.ts`.
`test/native-modules.test.ts` e `test/cli-shell.test.ts` falham até todas as
partes a terem.
