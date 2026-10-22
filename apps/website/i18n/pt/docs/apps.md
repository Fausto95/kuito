# Projetos de aplicação

Uma aplicação criada por `kuito create` ([CLI](cli.md#create-an-app)) contém apenas TypeScript
e configuração. Tudo o que é nativo vem no framework, e a
CLI gera e compila as shells nativas de cada aplicação a pedido.

```text
MyApp/
  app/                 the app: file-based routes (navigation.md)
  assets/              icon.png and icon-staging.png, the app icons; splash.png
  modules/             the app's own native modules (below)
  kuito.config.ts     native settings: name, ids, icon, environments
  package.json         one dependency: kuito
  tsconfig.json
  .gitignore           node_modules/, dist/, .kuito/
  .kuito/             generated shells and builds; never committed
```

## Decisões

| Decisão                                                                                                        | Como a estrutura a segue                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Uma atualização é um único incremento de versão.                                                               | A aplicação não faz commit de nenhum projeto `ios/` ou `android/`. `kuito` é a sua única dependência, e as shells são regeneradas a partir do framework instalado em cada compilação, pelo que uma versão nova traz shells novas. |
| Um pacote, uma versão: CLI, kernel, renderizadores, compilador e Hermes avançam juntos.                        | Todos vivem em `kuito`: `src/cli`, `src/runtime`, `native/` e o pin do Hermes, `native/hermes.json`. O comando `kuito` da aplicação é o `bin` desse pacote.                                                                       |
| As definições nativas específicas da aplicação vão para a configuração, nunca para ficheiros nativos editados. | `kuito.config.ts` é a única entrada nativa. A CLI transforma-o numa especificação XcodeGen e em propriedades Gradle (`src/cli/shells.ts`); nada em `.kuito/` é para ser editado, e nada em `native/` muda por aplicação.          |
| As shells nativas são geradas para uma cache, `.kuito/`, que está no gitignore e nunca é commitada.            | `kuito dev` e `kuito build` escrevem tudo aí: o projeto iOS e os derived data, a compilação e as caches do Gradle, e o JS empacotado.                                                                                             |
| Espaço para `kuito upgrade` (um incremento mais codemods).                                                     | Nada que uma atualização tivesse de fundir vive na aplicação: apenas `kuito.config.ts` e o código da aplicação, que os codemods podem reescrever.                                                                                 |

## kuito.config.ts

```ts
import type { KuitoConfig } from 'kuito/config';

export default {
  name: 'MyApp',
  version: '1.2.0',
  buildNumber: 14,
  icon: './assets/icon.png',
  ios: { bundleIdentifier: 'com.example.myapp' },
  android: { applicationId: 'com.example.myapp' },
  environments: {
    staging: {
      name: 'MyApp Staging',
      idSuffix: '.staging',
      icon: './assets/icon-staging.png',
    },
  },
} satisfies KuitoConfig;
```

| Chave                              | Efeito                                                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `name`                             | O nome sob o ícone da aplicação: `CFBundleDisplayName`, a etiqueta da aplicação no Android.                                         |
| `version`                          | O que os utilizadores veem: `CFBundleShortVersionString`, `versionName`. Até três números. `1.0.0`.                                 |
| `buildNumber`                      | Aquilo pelo que as lojas ordenam os envios: `CFBundleVersion`, `versionCode`. Aumente-o a cada envio. `1`.                          |
| `icon`                             | O ícone da aplicação em ambas as plataformas: um PNG quadrado de pelo menos 1024×1024. Opcional.                                    |
| `ios.bundleIdentifier`             | `PRODUCT_BUNDLE_IDENTIFIER`; o id que o `kuito dev` instala e lança.                                                                |
| `ios.icon.light`                   | Substitui `icon` no iOS.                                                                                                            |
| `ios.icon.dark`, `ios.icon.tinted` | As aparências escura e tingida do ícone (iOS 18). Podem ser transparentes.                                                          |
| `android.applicationId`            | O `applicationId` do Gradle; o pacote que o `kuito dev` instala e lança.                                                            |
| `android.adaptiveIcon.foreground`  | A camada de primeiro plano do ícone adaptativo. Sem ela, `icon` preenche a área visível.                                            |
| `android.adaptiveIcon.background`  | Uma cor (`#1E88E5`) ou um PNG. Por padrão, a cor do canto superior esquerdo de `icon`, ou branco.                                   |
| `android.adaptiveIcon.monochrome`  | A camada de cor única dos ícones temáticos do Android 13.                                                                           |
| `permissions`                      | O que a aplicação pede, com as razões do iOS; ver [Permissões](permissions.md#declare-them-in-kuitoconfigts).                       |
| `backgroundTasks`                  | Os nomes das tarefas que o SO pode executar em segundo plano; ver [Tarefas em segundo plano](background-tasks.md).                  |
| `fonts`                            | Ficheiros .ttf e .otf que `fontFamily` aceita, incluídos em ambas as shells; ver [Fontes](fonts.md#bundle-fonts).                   |
| `migrations`                       | As migrações da base de dados da aplicação, a mais antiga primeiro; ver [Armazenamento](storage.md#migrations). Não é por ambiente. |
| `splash.logo`                      | O logótipo do ecrã de arranque, um PNG desenhado ao centro; ver [Ecrã de arranque](splash.md).                                      |
| `splash.logoWidth`                 | A largura do logótipo em pontos e dp, até 288. `100`.                                                                               |
| `splash.background`                | A cor do ecrã de arranque. `#FFFFFF`.                                                                                               |
| `splash.brand`                     | Um PNG ajustado a uma caixa de 200×80, a 60 do fundo. Opcional.                                                                     |
| `splash.dark`                      | `logo`, `background` e `brand` em modo escuro.                                                                                      |
| `splash.variants.<name>`           | Outros aspetos que a aplicação pode escolher para o seu próximo arranque (Android 13 e posteriores).                                |
| Definições nativas                 | Orientação, aparência, esquemas de URL, entradas do Info.plist e do manifesto; ver [Definições nativas](#native-settings).          |
| `environments.<name>`              | Substituições de qualquer chave acima exceto `migrations`, mais `idSuffix`, para um ambiente (abaixo).                              |

A CLI carrega o ficheiro com o Node e verifica-o: uma chave em falta ou desconhecida, um id malformado, um
ícone que não é um caminho `.png`, uma fonte que não é um caminho `.ttf` ou `.otf` ou uma cor malformada é um erro que nomeia o ficheiro e a chave, em
qualquer ambiente em que esteja. Os ids são em DNS invertido (`com.example.app`); os segmentos do Android
têm de começar por uma letra. Os caminhos das imagens são relativos a `kuito.config.ts`. `version` tem de ser até três
números (o formato das lojas) e `buildNumber` um número inteiro até 2100000000 (o limite da Google
Play); não há outra cópia de nenhum dos dois, e o `package.json` da aplicação não tem
`version`. Todos os comandos `kuito` que compilam ou executam uma aplicação precisam de um `kuito.config.ts` no
diretório em que correm, e falham sem ele. Este checkout aloja uma aplicação da mesma forma:
`demo/` é o Reel, com o seu próprio `kuito.config.ts` e `package.json` ([montra](showcase.md#config)).

Chaves planeadas, ainda não lidas: propriedades Gradle. Serão substituíveis por ambiente
da mesma forma.

### Definições nativas

O que de outro modo significaria editar o `Info.plist`, os entitlements, o `AndroidManifest.xml` ou um
tema é uma chave na configuração. As chaves tipadas vêm primeiro: um valor, escrito na definição
própria de cada plataforma.

```ts
export default {
  // ...
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: '#101418',
  statusBar: { style: 'light' },
  urlSchemes: ['myapp'],
  linkDomains: ['example.com'],
  ios: { bundleIdentifier: 'com.example.myapp' },
  android: { applicationId: 'com.example.myapp', softInputMode: 'resize' },
} satisfies KuitoConfig;
```

| Chave                        | Valores (padrão primeiro)                             | iOS                                                                                  | Android                                                                                                                            |
| ---------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `orientation`                | `default`, `portrait`, `landscape`                    | `UISupportedInterfaceOrientations` e a sua variante `~ipad`                          | O `android:screenOrientation` da atividade: `portrait` ou `sensorLandscape`                                                        |
| `userInterfaceStyle`         | `automatic`, `light`, `dark`                          | `UIUserInterfaceStyle`                                                               | O pai de `AppTheme`, e o modo noturno da atividade (meta-data `dev.kuito.userInterfaceStyle`)                                      |
| `backgroundColor`            | nenhuma, ou uma cor como `#101418`                    | A cor da janela e da vista raiz (`KuitoBackgroundColor`)                             | O `android:windowBackground` de `AppTheme`, e a cor da raiz (meta-data `dev.kuito.backgroundColor`)                                |
| `statusBar.style`            | `auto`, `light`, `dark`                               | `UIStatusBarStyle`                                                                   | O `android:windowLightStatusBar` de `AppTheme`                                                                                     |
| `statusBar.hidden`           | `false`, `true`                                       | `UIStatusBarHidden`                                                                  | O `android:windowFullscreen` de `AppTheme`                                                                                         |
| `urlSchemes`                 | nenhum, ou esquemas como `myapp`                      | `CFBundleURLTypes`                                                                   | Um intent filter `VIEW` / `BROWSABLE` na atividade                                                                                 |
| `ios.supportsTablet`         | `true`, `false`                                       | `TARGETED_DEVICE_FAMILY`: `1,2` ou `1`                                               | —                                                                                                                                  |
| `ios.requiresFullScreen`     | `false`, `true`                                       | `UIRequiresFullScreen`: exclui-se do multitasking do iPad                            | —                                                                                                                                  |
| `ios.deploymentTarget`       | `16.0`, ou posterior                                  | O deployment target do target                                                        | —                                                                                                                                  |
| `linkDomains`                | nenhum, ou domínios como `example.com`                | Uma entrada `applinks:` cada no entitlement de domínios associados                   | Um intent filter `VIEW` / `BROWSABLE` verificado (`autoVerify`) para `https` em cada host ([ligações](linking.md#link-domains))    |
| `ios.associatedDomains`      | nenhum, ou entradas como `webcredentials:example.com` | O entitlement `com.apple.developer.associated-domains`, ao lado dos de `linkDomains` | —                                                                                                                                  |
| `ios.backgroundModes`        | nenhum, ou `audio`, `location`, `fetch`, ...          | `UIBackgroundModes`                                                                  | —                                                                                                                                  |
| `permissions.locationAlways` | nenhuma, ou a razão que o iOS mostra                  | `UIBackgroundModes` `location`, ao lado da razão                                     | O serviço em primeiro plano `KuitoLocationService` e `FOREGROUND_SERVICE_LOCATION` ([Localização](location.md#background-updates)) |
| `android.softInputMode`      | `resize`, `pan`                                       | —                                                                                    | O `android:windowSoftInputMode` da atividade: `adjustResize` ou `adjustPan`                                                        |
| `android.minSdk`             | `26`, até `35`                                        | —                                                                                    | O `minSdk` do Gradle                                                                                                               |

Uma chave deixada no seu padrão não escreve nada, pelo que a definição própria da shell prevalece: as
orientações do dispositivo, o claro ou escuro do sistema, a barra de estado a segui-lo. O
`style` da barra de estado nomeia o seu conteúdo: `light` para um fundo escuro. `StatusBar` altera ambos em tempo
de execução; estes são aquilo com que a aplicação arranca. `portrait` mantém os iPads capazes de virar ao
contrário, como os modelos da Apple fazem; no iPad, uma aplicação que não suporta todas as orientações precisa
também de `ios.requiresFullScreen` para a App Store.

`android.softInputMode` fica em `resize` a menos que a aplicação evite o teclado por si própria. A
shell é de ponta a ponta, pelo que `adjustResize` não redimensiona nada; entrega os insets do teclado
às vistas, que mantêm os campos focados afastados dele ([Teclado](keyboard.md#avoidance)).
`pan` faz com que o sistema deslize também a janela inteira para cima, pelo que o conteúdo se move duas vezes a menos que
a evitação seja desligada (`keyboard={{ inset: false }}`).

Não configurável: a shell é sempre de ponta a ponta (como as aplicações novas do React Native são, e como
o Android 15 exige), e o `targetSdk` do Android é o `compileSdk` do framework, 35.

#### Entradas do Info.plist, dos entitlements, do manifesto e do tema

Tudo o que não tem uma chave tipada continua a ser dados, nunca um ficheiro nativo ou uma string XML:

```ts
ios: {
  bundleIdentifier: 'com.example.myapp',
  infoPlist: { LSApplicationQueriesSchemes: ['maps'], ITSAppUsesNonExemptEncryption: false },
  entitlements: { 'aps-environment': 'production' },
},
android: {
  applicationId: 'com.example.myapp',
  manifest: {
    application: { allowBackup: false },
    activity: { screenOrientation: 'fullUser' },
    metaData: { 'com.google.android.geo.API_KEY': 'AIza...' },
    usesPermissions: ['android.permission.VIBRATE'],
    usesFeatures: [{ name: 'android.hardware.camera', required: false }],
    queries: { packages: ['com.google.android.apps.maps'] },
    intentFilters: [
      {
        actions: ['android.intent.action.VIEW'],
        categories: ['android.intent.category.DEFAULT', 'android.intent.category.BROWSABLE'],
        data: [{ scheme: 'https', host: 'example.com', pathPrefix: '/show' }],
        autoVerify: true,
      },
    ],
  },
  theme: { 'android:navigationBarColor': '#000000' },
},
```

| Chave                              | Escrita em                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ios.infoPlist`                    | O `Info.plist` gerado. Os valores são strings, números, booleanos, arrays e objetos.                   |
| `ios.entitlements`                 | O `KuitoIOS.entitlements` gerado, o `CODE_SIGN_ENTITLEMENTS` do target.                                |
| `android.manifest.application`     | Atributos de `<application>`, nomeados sem `android:`.                                                 |
| `android.manifest.activity`        | Atributos da única atividade da aplicação, nomeados sem `android:`.                                    |
| `android.manifest.metaData`        | `<meta-data>` sob `<application>`.                                                                     |
| `android.manifest.usesPermissions` | `<uses-permission>`, ao lado dos que `permissions` e os módulos acrescentam.                           |
| `android.manifest.usesFeatures`    | `<uses-feature>`; `required` é `true` por padrão.                                                      |
| `android.manifest.queries`         | `<queries>`: `packages`, e `intents` (uma `action` e `data` opcional), para a visibilidade de pacotes. |
| `android.manifest.intentFilters`   | `<intent-filter>`s na atividade: `actions`, `categories`, `data` e `autoVerify`.                       |
| `android.theme`                    | `<item>`s de `AppTheme`, por nome, nas suas variantes clara e noturna.                                 |

Cada entrada é verificada como qualquer outra chave: uma chave desconhecida, um nome que não o é, um valor
que contém marcação ou não é dados plist falha com o caminho da chave.

**Um dono por entrada.** Todas as fontes de entradas passam por uma única fusão
(`src/cli/native-entries.ts`): as chaves tipadas da configuração e `permissions`, as especificações dos módulos
nativos incluídos (`ios.infoPlist`, `android.permissions`, ...), estas entradas em bruto, e o que a própria shell define. Duas que
discordem numa chave falham a compilação nomeando ambas, como `Info.plist key UISupportedInterfaceOrientations
is set by both kuito.config.ts: orientation and kuito.config.ts: ios.infoPlist`. Assim, uma entrada em bruto
não pode contradizer uma chave tipada nem um módulo, e aquilo de que o código da shell depende
(`UIApplicationSceneManifest`; o `launchMode`, o `exported` e o `configChanges` da atividade; a
etiqueta, o ícone e o tema da aplicação) não pode ser definido de todo. Duas exceções: uma razão
declarada em `permissions` substitui o padrão de um módulo para a mesma chave de utilização, e as chaves de lista a que
várias fontes acrescentam (`UIBackgroundModes`, `LSApplicationQueriesSchemes`, `UIAppFonts`,
`BGTaskSchedulerPermittedIdentifiers`, domínios associados) são juntas.

No Android, as entradas em bruto e tipadas vão para o overlay de manifesto que o Gradle funde sobre o
da shell (`kuito.manifest`); um atributo que o manifesto da shell também define é substituído com
`tools:replace`, que o overlay acrescenta por si. `AppTheme` é gerado em
`.kuito/android/settings` (`values` e `values-night`, `kuito.settingsRes`), substituindo o
do framework.

### Ambientes

A própria configuração é a aplicação de produção. Um ambiente é um nome e as chaves que diferem
dela; todas as outras chaves são herdadas, as chaves aninhadas uma a uma (`ios: { icon: { dark } }`
mantém `ios.bundleIdentifier`; `buildNumber` pode diferir para um envio de staging; `permissions: { microphone }` acrescenta uma às da base). Os mapas de entradas (`ios.infoPlist`,
`ios.entitlements`, `android.theme`, e `application`, `activity` e
`metaData` de `android.manifest`) fundem-se também chave a chave; uma lista (`fonts`, `urlSchemes`,
`android.manifest.intentFilters`) é substituída por inteiro. `idSuffix` acrescenta-se tanto ao bundle id como ao
applicationId, pelo que cada ambiente se instala como uma aplicação própria ao lado das outras.

```sh
kuito dev ios                   # development
kuito dev ios --env staging     # MyApp Staging, com.example.myapp.staging
kuito build android             # production
```

`--env` escolhe um. `kuito dev` executa `development` e `kuito build` compila `production` quando
não é indicado. Ambos existem sempre e são a configuração tal como escrita, a menos que sejam declarados; qualquer outro
nome tem de ser declarado em `environments`. Os nomes são letras minúsculas, dígitos e `-`.

Os ambientes são dados, não código: um objeto por ambiente, pelo que um engano é um erro que
nomeia a sua chave, e as chaves futuras tornam-se substituíveis sem mecanismos novos: o
`splash: { background }` de um ambiente altera a cor e mantém o logótipo. O ambiente é apenas uma definição de compilação; o JS da aplicação ainda não o vê.

### Ícones da aplicação

Um único PNG de 1024×1024 chega. Em cada compilação, a CLI gera o que cada plataforma precisa em
`.kuito/` (`src/cli/app-icons.ts`):

- **iOS**: `.kuito/ios/AppIcon.xcassets`, um `AppIcon` de tamanho único 1024 com as suas aparências escura e
  tingida quando a configuração as tem. O Xcode deriva todos os outros tamanhos. Os ícones do iOS são
  opacos: um ícone com transparência é achatado sobre branco, e a sessão mostra um aviso
  que nomeia a chave, por isso exporte-o sem alfa para escolher o fundo.
- **Android**: `.kuito/android/res`: um ícone adaptativo (`mipmap-anydpi-v26`) com camadas de primeiro plano,
  fundo e monocromática de 108dp, e ícones legados de 48dp compostos a partir das mesmas
  camadas, em todas as densidades de mdpi a xxxhdpi. Sem `adaptiveIcon`, o ícone inteiro é
  desenhado nos 72dp que a máscara de um launcher mostra, sobre a cor do próprio canto do ícone, pelo que nenhuma parte
  dele é cortada; defina `adaptiveIcon.foreground` para arte que se estende para a margem.

As fontes são verificadas primeiro: cada uma tem de ser um PNG (não entrelaçado), quadrado e de pelo menos 1024px,
ou a compilação falha nomeando a chave. As imagens são descodificadas, reamostradas e codificadas por um pequeno
codec PNG sobre `node:zlib` (`src/cli/png.ts`), pelo que não é preciso nenhuma ferramenta ou pacote de imagem e corre
onde quer que o Gradle corra. A geração é saltada quando nem os bytes das fontes nem a configuração
mudaram desde a última compilação (um carimbo ao lado do diretório gerado).

## Shells geradas

`kuito dev` e `kuito build` correm no diretório do projeto e escrevem no seu `.kuito/`:

- **iOS**: `.kuito/ios/project.json` é uma especificação XcodeGen que inclui o
  `native/ios/project.yml` do framework e acrescenta o JS empacotado e as migrações da aplicação (`Resources/`), o bundle id, o nome
  de exibição, a versão, o número de compilação, as entradas do Info.plist e os entitlements ([definições nativas](#native-settings)),
  o catálogo de ícones, o catálogo das imagens importadas (`Assets.xcassets`, [recursos](assets.md)), o ecrã de arranque (`Splash/`, [Ecrã de arranque](splash.md)), as fontes incluídas (`fonts/`, listadas em `UIAppFonts`), as fontes dos módulos
  nativos incluídos e a tabela de ligação gerada (`Generated/KuitoLink.swift`); as especificações incluídas fundem-se, pelo que
  a especificação do framework não é editada. `KUITO_NATIVE` aponta os caminhos próprios da especificação do framework
  de volta para `native/ios`. O Hermes é um pacote Swift local, `HermesEngine`, em
  `KUITO_HERMES` (`~/.cache/kuito/hermes-ios-<version>`, ver [a CLI](cli.md)); os
  pacotes Swift dos módulos juntam-se a ele. O xcodebuild compila `KuitoIOS.xcodeproj` e resolve
  os pacotes por si. Os derived data vão para `.kuito/build/ios`.
- **Android**: o Gradle compila o `native/android` do framework com `-Pkuito.applicationId`,
  `kuito.appName`, `kuito.assets` (o JS empacotado, as fontes e as migrações), `kuito.buildDir`, os
  `kuito.sources` e `kuito.dependencies` dos módulos nativos, `kuito.manifest` (as permissões que a aplicação e
  os seus módulos declaram, o serviço de tarefas em segundo plano e todas as entradas de manifesto das suas
  definições, fundidas sobre o manifesto do framework), `kuito.settingsRes` (o
  `AppTheme` da aplicação), `kuito.versionName`, `kuito.versionCode`, `kuito.minSdk` (quando aumentado) e
  `kuito.res` (o ícone gerado, quando existe), `kuito.splashRes` (os recursos do tema
  de arranque, quando existe), `kuito.imagesRes` (as imagens importadas, quando a aplicação
  importa alguma, [recursos](assets.md)), e
  `--project-cache-dir .kuito/android/.gradle`. A tabela de ligação é gerada também (`generated/dev/kuito/link/KuitoLink.kt`), pelo que o
  projeto só compila através da CLI (`kuito build android`).

Cada aplicação instala-se como uma aplicação própria, ao lado de outras aplicações Kuito no mesmo dispositivo.

## Módulos nativos

`modules/<name>/` contém os módulos nativos próprios de uma aplicação: a especificação `<name>.ts`, `ios/*.swift`
e `android/*.kt`. `kuito module create <Name>` cria um. A CLI descobre-os ao lado
dos incorporados do Kuito, inclui em cada shell apenas os módulos que o bundle da aplicação chama, e
gera a tabela de ligação das funções que ele chama, pelo que ninguém edita o framework. Ver
[módulos nativos](native-modules.md#write-your-own-module).

Os hooks de ciclo de vida, os pacotes de módulos de terceiros e `kuito prebuild` virão mais tarde.
