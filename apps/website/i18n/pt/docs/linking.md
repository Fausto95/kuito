# linking

Abra URLs noutras apps e siga as ligações que abrem esta. No iOS é
`UIApplication.open`; no Android, um intent `ACTION_VIEW`.

```tsx
import { watch, linking } from 'kuito';

await linking.open('https://www.tvmaze.com');
if (await linking.canOpen('mailto:hi@example.com')) await linking.open('mailto:hi@example.com');

linking.url.value; // 'kuito://show/42', or null
watch(linking.url, (url) => console.log(url)); // in a component
```

| Membro         | É                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| `open(url)`    | Abre `url` na app que o trata. Rejeita com `ERR_URL` quando nenhuma app o faz, ou quando `url` não tem esquema.      |
| `canOpen(url)` | Se uma app instalada trata `url` (abaixo).                                                                           |
| `url`          | Um sinal: a ligação que abriu a app por último, a começar pela que a lançou, ou `null`. Um recarregamento mantém-no. |

`url` é lido de forma síncrona. Enquanto algo o observa, acompanha cada
ligação que abre a app enquanto esta corre; a mesma ligação duas vezes seguidas
é uma única mudança. A página da app nas Definições é
[`app.openSettings()`](app-state.md).

Para navegar com deep links, um `<Router linking>` fá-lo por si
([navigation.md](navigation.md#deep-links)); observe `url` você mesmo apenas
para ligações que não são rotas.

## canOpen

Ambas as plataformas escondem as outras apps a menos que a app declare aquilo
sobre que pergunta:

- O iOS responde `true` para `http` e `https` e, para outros esquemas, apenas
  quando `LSApplicationQueriesSchemes` no `Info.plist` os lista (`ios.infoPlist`
  em [`kuito.config.ts`](apps.md#native-settings)).
- O Android 11 e posteriores respondem para os intents que o `<queries>` do
  manifesto nomeia. A shell declara `http`, `https`, `mailto`, `tel` e `sms`;
  uma app acrescenta mais com `android.manifest.queries`.

`open` não precisa de nenhum dos dois: abre o que quer que o sistema consiga.

## O esquema de URL da app

Os esquemas de uma app são `urlSchemes` em [`kuito.config.ts`](apps.md#native-settings):
`urlSchemes: ['myapp']` faz com que `myapp://show/42` a abra, através de `CFBundleURLTypes` no iOS
e de um intent filter `VIEW` com `<data android:scheme="myapp" />` no Android. A app de
demonstração deste checkout, a Reel, declara `kuito`, que os exemplos aqui usam. A atividade é
`singleTask`, pelo que uma ligação que chega enquanto a app corre chega-lhe através de `onNewIntent`
em vez de iniciar uma segunda.

### Domínios de ligação

`linkDomains: ['example.com']` faz com que as ligações https do site abram a app em vez do
navegador: universal links no iOS, um associated domain `applinks:example.com` para cada um
(além de qualquer `ios.associatedDomains` que a app declare), e app links verificados no Android,
um intent filter `VIEW` com `autoVerify` para `https://example.com`. Um domínio é um nome de
anfitrião, sem esquema nem caminho. O site prova que a ligação é da app: serve
`/.well-known/apple-app-site-association` nomeando a equipa e o bundle identifier da app, e
`/.well-known/assetlinks.json` nomeando o seu applicationId e certificado de assinatura. Sem
eles, o iOS e o Android continuam a abrir o navegador.

Um `<Router linking>` mapeia uma ligação dessas para uma rota pelo seu caminho, como faz com
as de um esquema personalizado ([deep links](navigation.md#deep-links)): `https://example.com/show/42` é
`/show/42`.

Experimente uma a partir do terminal:

```bash
xcrun simctl openurl booted kuito://show/1
```

```bash
adb shell am start -a android.intent.action.VIEW -d kuito://show/1
```

Uma ligação que inicia a shell de desenvolvimento a frio corre a app
empacotada na shell e chega ao servidor de desenvolvimento no URL por omissão,
como o faria o primeiro lançamento através de `kuito dev`. Uma build de
release abre ligações a frio tal como a quente.

## Como está ligado

A shell reporta as ligações a `KuitoLinks` (`native/modules/linking`), e o
módulo `Linking` lê-as aí: a ligação mais recente sob um lock, para a leitura
síncrona da thread JS. A sua spec marca-o como `always`, pelo que todas as
shells o incluem ([módulos nativos](native-modules.md#which-modules-a-shell-includes)):

- iOS: as connection options do scene delegate (a ligação de lançamento, ou o
  `webpageURL` de um universal link), depois `scene(_:openURLContexts:)` e
  `scene(_:continue:)`.
- Android: o intent da atividade em `onCreate`, depois `onNewIntent`.

`KuitoLinks` sobrevive ao runtime, pelo que a última ligação permanece após um
recarregamento e as ligações continuam a fluir para o runtime que estiver a
observar.
