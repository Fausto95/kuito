# Módulos nativos

Um módulo nativo é código de plataforma que uma aplicação chama: uma classe
Swift no iOS, uma classe Kotlin no Android e uma especificação TypeScript que
declara ambas e as tipa para a aplicação. As capacidades do próprio Kuito são
construídas desta forma e são distribuídas como espaços de nomes de funções e
sinais em minúsculas: `haptics`, `clipboard`,
[`linking`](linking.md), [`network`](network.md), [`share`](share.md),
[`permissions`](permissions.md), [`location`](location.md),
[`storage`](storage.md), [`secureStore`](secure-store.md),
[`app`](app-state.md), [`window`](window.md), [`keyboard`](keyboard.md),
[`accessibility`](accessibility.md), [`device`](device.md),
[`localization`](localization.md), [`splash`](splash.md),
[`appearance`](appearance.md), [`keepAwake`](keep-awake.md),
[`brightness`](brightness.md), [`backgroundTasks`](background-tasks.md),
[`fileSystem`](file-system.md), [`mediaPicker`](image-picker.md),
[`fonts`](fonts.md), [`image`](primitives.md#image), [`SystemBars`](system-ui.md),
[`alert()` e `prompt()`](alert.md), [`actionSheet()`](action-sheet.md) e [`audio`](audio.md).
Um módulo pode também contribuir com uma vista que uma aplicação renderiza em JSX
([vistas](#views)), como fazem [`Camera`](camera.md),
[`WebView`](webview.md) e [`Video`](video.md). Um módulo que precisa de uma
permissão em tempo de execução pede-a nativamente através de `KuitoPermissions`; ver
[permissões](permissions.md#from-another-module).

```tsx
import { Text, clipboard, haptics } from 'kuito';

console.log(await clipboard.readText());
await clipboard.writeText('https://www.tvmaze.com');
void haptics.selection();

<Text>{clipboard.hasText.value ? 'Paste' : 'Nothing to paste'}</Text>;
```

Cada capacidade é um espaço de nomes da entrada raiz, um ficheiro que exporta as
suas funções uma a uma, para que um bundle mantenha apenas as funções que chama.

## A especificação de um módulo

Um módulo é declarado uma vez, em TypeScript, e ligado por id: o compilador lê
a especificação sem a executar, o bundle mantém um stub para cada função que a
aplicação chama, e a shell compila uma tabela de ligação apenas com essas. Nada
é despachado por nome.

`modules/battery/battery.ts`, a especificação, com o nome do seu diretório:

```ts
import { defineModule, event, fn, live } from 'kuito';

export type Mode = 'saver' | 'normal';
export type Reading = { level: number; charging: boolean; until: number | null };
export type LowBattery = { level: number };

export default defineModule('Battery', {
  read: fn.sync<() => Reading>(),
  setMode: fn.main<(mode: Mode) => Promise<void>>(),
  history: fn.background<(days: number) => Promise<number[]>>(),
  requestAccess: fn.main.callback<() => Promise<boolean>>(),
  charging: live<boolean>(),
  low: event<LowBattery>(),
  ios: { class: 'BatteryModule' },
  android: { class: 'com.example.myapp.modules.battery.BatteryModule' },
});
```

| Declaração              | Executa em                           | O JavaScript recebe | Nativamente                                    |
| ----------------------- | ------------------------------------ | ------------------- | ---------------------------------------------- |
| `fn.sync`               | a thread JS                          | o valor             | devolve o valor                                |
| `fn.main`               | a thread principal (UI)              | uma Promise         | devolve o valor, `@MainActor`                  |
| `fn.background`         | a thread de fundo em série do módulo | uma Promise         | devolve o valor                                |
| `fn.main.callback`, ... | começa na sua thread                 | uma Promise         | resolve uma `KuitoPromise` uma vez, mais tarde |

Além de funções, uma especificação declara o que a plataforma envia:

- **`event<Payload>()`**, um evento: `low.addListener(fn)` devolve uma
  subscrição. A plataforma envia-o desde o primeiro ouvinte até que o último
  seja removido: nativamente, `startLow(_ emitter: KuitoEmitter<LowBattery>)` e
  `stopLow()` executam na thread principal, e `emitter.send(payload)` pode ser
  chamado a partir de qualquer thread entretanto. `event()` sem tipo não tem payload.
- **`live<T>()`**, estado da plataforma que uma aplicação lê como um sinal
  (`battery.charging.value`). Sem ser observado, cada leitura chama `charging()` na
  thread JS, pelo que nunca está desatualizado; enquanto algo o observa,
  `startCharging(_ signal: KuitoSignal<Bool>)` executa na thread principal e
  `signal.set(value)` escreve o sinal através do kernel. `live`, não
  `signal`: `signal()` cria um sinal próprio da aplicação.
- **`view<Props, Methods>({ events, methods })`**, uma vista que a aplicação renderiza em
  JSX ([vistas](#views)).

### O que uma especificação pode conter

O compilador lê a especificação tal como está escrita (src/dev/modules/spec.ts), pelo que
ela contém apenas imports, tipos e a sua exportação por omissão, `defineModule`, com todos
os valores literais. Uma instrução que seria executada é um erro de build na sua linha, e
o mesmo acontece com qualquer coisa abaixo que as plataformas não possam partilhar.

- **O nome** é uma string literal em PascalCase: `Battery` é o que Swift e
  Kotlin implementam como `BatterySpec`.
- **Parâmetros e resultados** são `number`, `string`, `boolean`, `Json`,
  arrays, `Record<string, T>`, `T | null`, parâmetros e campos opcionais, e
  tipos nomeados. Uma união de strings declarada com `type` torna-se um enum (`Mode`:
  `.saver` em Swift, `Mode.SAVER` em Kotlin), e um tipo objeto declarado com
  `type` ou `interface` uma struct ou data class. Uma união ou objeto inline é
  um erro que sugere o alias; um genérico, `extends`, um tipo função ou um
  tipo que se contém a si próprio é também um erro.
- **Os nomes dos membros** são identificadores Swift e Kotlin, cada um declarado uma vez.
  `then` e `default` são reservados, assim como `always`, `ios` e `android`,
  que contêm as [necessidades nativas](#native-needs) do módulo.
- **O método de uma vista** executa na thread principal com a vista, por isso é
  `fn.main`, e não pode ter o nome de um membro do elemento da vista
  (`id`, `focus`, `addEventListener`, ...).
- **Um import de outra especificação** é um módulo que este requer nativamente
  (`import '../permissions/permissions'`): a shell inclui-o também.

Uma aplicação importa a exportação por omissão da especificação, o módulo, e chama os seus membros:
`import Battery from './modules/battery/battery'` e `Battery.read()`. Os seus
tipos são os da própria especificação; o bundle continua a manter apenas os membros chamados.
As capacidades do próprio Kuito reexportam os seus a partir do seu espaço de nomes
(`haptics.impact`, `clipboard.hasText`).

### O que o compilador gera

- **Um stub por membro**, no lugar da especificação: `const read =
  /* @__PURE__ */ globalThis.__kuito.link(3, "Battery.read", "js", [])`, o seu
  id, thread e esquema de argumentos (src/dev/modules/stubs.ts). Eventos, valores
  live e vistas têm os seus próprios (`linkEvent`, `linkLive`, `linkView`). Os ids
  numeram cada membro de cada módulo que a aplicação pode chamar, por nome de módulo, depois
  por ordem de declaração, uma vista e depois cada um dos seus métodos
  (src/dev/modules/catalog.ts). Cada stub é puro, pelo que o bundler descarta todos
  os que a aplicação não chama; os ids ainda presentes no bundle após a eliminação de
  código morto são a tabela de ligação da shell (src/dev/modules/plugin.ts).
- **Um protocolo Swift e uma interface Kotlin por módulo**, `BatterySpec:
  KuitoLinkedModule`, com os enums e structs da especificação (src/cli/link-swift.ts,
  link-kotlin.ts). A classe que `ios.class` e `android.class` nomeiam conforma-se a
  ele; uma classe que se desviou da sua especificação falha o build nativo, nomeando o
  método:

  ```swift
  final class BatteryModule: BatterySpec {
      init(context: KuitoModuleContext) {}
      func read() throws -> Reading { … }
      @MainActor func setMode(_ mode: Mode) throws { … }
      func history(_ days: Double) throws -> [Double] { … }
      @MainActor func requestAccess(_ promise: KuitoPromise<Bool>) { … }
      func charging() throws -> Bool { … }
      @MainActor func startCharging(_ signal: KuitoSignal<Bool>) { … }
      @MainActor func stopCharging() { … }
      @MainActor func startLow(_ emitter: KuitoEmitter<LowBattery>) { … }
      @MainActor func stopLow() { … }
  }
  ```

  ```kotlin
  class BatteryModule(private val context: KuitoModuleContext) : BatterySpec {
      override fun read(): Reading = …
      override fun setMode(mode: Mode) { … }
      override fun history(days: Double): List<Double> = …
      override fun requestAccess(promise: KuitoPromise<Boolean>) { … }
      override fun charging(): Boolean = …
      override fun startCharging(signal: KuitoSignal<Boolean>) { … }
      override fun stopCharging() { … }
      override fun startLow(emitter: KuitoEmitter<LowBattery>) { … }
      override fun stopLow() { … }
  }
  ```

  Os tipos Kotlin estão em `dev.kuito.link` (`import dev.kuito.link.BatterySpec`).
  Os números são `Double`, `Json` é `Any` em Swift e `Any?` em Kotlin, e
  um campo opcional é um opcional Swift ou um nullable Kotlin com valor por omissão
  null.

- **`destroy()`**, que a classe de um módulo pode implementar, executa na thread
  principal quando o runtime se encerra (um reload, ou o fecho da aplicação), depois
  de os seus observadores pararem: devolva o que o módulo detém fora do runtime,
  como `keepAwake` devolve o temporizador de inatividade.
- **A tabela de ligação**, `ios/Generated/KuitoLink.swift` e
  `android/generated/dev/kuito/link/KuitoLink.kt` em `.kuito/`:
  `KuitoLink.function(id)` contém uma `KuitoFunction(name, thread:, arity:,
  run:)` por id de função que o bundle chama, que descodifica os argumentos para
  os tipos da especificação, chama o módulo e codifica o seu resultado, e
  `KuitoLink.observer(id)` uma entrada por evento e valor live que observa.
  A instância de um módulo é criada, com `init(context:)`, na sua primeira chamada. Um
  ficheiro gerado que um build já não escreve é eliminado.

Um Live Patch que chama uma função que a shell em execução não ligou, ou uma alteração
de especificação que as renumera, reconstrói a shell.

### O que uma release distribui

O tree shaking funciona ao nível das funções. O bundle contém um stub apenas
para cada membro que a aplicação chama; um módulo do qual nenhum membro é chamado
não é de todo compilado na shell, a menos que esteja [sempre ativo ou seja
requerido](#which-modules-a-shell-includes). De um módulo que o esteja, os builds de
release mantêm apenas o que a tabela de ligação alcança. No Android, o R8 reduz a aplicação
e `native/android/app/proguard-rules.pro` não mantém nada por nome além dos
pontos de entrada JNI, pelo que uma função que nenhuma entrada chama é removida. No iOS, um build
Release otimiza o módulo inteiro e liga com `-dead_strip`: a tabela de ligação
alcança um módulo apenas através do protocolo da sua especificação, pelo que a witness de um
requisito que nenhuma entrada chama, e o método por trás dela, são descartados. Nada
aqui é `@objc` ou aberto a subclasses, o que os manteria vivos. Um build Debug
mantém tudo.

## Vistas

Um módulo pode contribuir com uma vista: uma `UIView` no iOS e uma `View` Android,
renderizada em JSX como qualquer primitiva. Recebe props de estilo e layout, o
motor de flexbox partilhado posiciona-a, e os seus eventos chegam como props `on*`.
Nada muda nos renderers para adicionar uma. `Slider` é distribuído com o Kuito e é
construído desta forma.

```tsx
import { Slider } from 'kuito';

<HStack gap={12}>
  <Text>Volume</Text>
  <Slider
    flex={1}
    height={40}
    value={volume}
    step={0.05}
    onChangeEnd={(event) => save(event.value)}
  />
</HStack>;
```

### Como funcionam as vistas

- **Uma vista é um membro da especificação do seu módulo.** `view: view<SliderProps>({
  events: ['change', 'changeEnd'] })` declara-a, e a aplicação renderiza a
  `view` do módulo (`Slider` é `SliderModule.view`). Um módulo tem no máximo uma
  vista, e pode ter funções e eventos ao lado dela.
- **Regista-se na primeira renderização.** Importar a vista não atravessa nada. Quando
  o kernel planeia uma pela primeira vez, chama o id da própria vista, e a plataforma
  regista o tipo (`module:Slider`) junto do renderer, com os eventos que a
  especificação declara.
- **As suas props são uma tabela indexada pelo nome da prop,** como as próprias tabelas
  `properties/` do renderer. As props da vista vêm primeiro, depois as tabelas partilhadas
  (layout, decoração, acessibilidade, gestos...), pelo que `width`, `margin`,
  `opacity` ou `label` funcionam nela sem alteração. Uma prop que a vista não declara
  e que nenhuma tabela partilhada possui lança `unsupportedProp`, e um valor que não
  descodifica para o tipo declarado `unsupportedValue`
  ([renderer nativo](native-renderer.md#errors)).
- **As suas props `on*` são os eventos que declara.** `onChangeEnd` escuta
  `changeEnd`. O handler recebe o evento (`type`, `target`) com os campos do
  payload nele, exceto `onChange`, que recebe o `value` do payload, como fazem
  os de um TextField e de um Toggle. Uma prop ligada a um sinal é
  bidirecional: um evento cujo payload tem um campo com o nome da prop escreve-a.
  Uma prop `on*` para um evento que a vista não declara é um erro que lista
  os que ela declara. A prop `gestures` continua a anexar gestos; outras props de
  evento (`onPress`, ...) não significam nada numa vista de módulo a menos que ela declare
  esse evento. Os eventos viajam pelo [formato de transmissão de eventos](events.md#wire-format).
- **Os seus métodos são métodos da sua ref.** O que as props não conseguem dizer (tirar uma
  fotografia, procurar num vídeo, recarregar uma página) uma vista declara como `methods`. O seu
  elemento, o valor que a sua `ref` contém, responde-lhes ao lado de `id` e
  `addEventListener`; cada um devolve uma Promise e executa na thread principal com
  essa vista. Uma chamada numa vista que já não está montada é rejeitada sem
  atravessar.
- **É uma folha, dimensionada pelo seu estilo.** O motor de layout não pode perguntar a uma câmara ou
  a uma web view por um tamanho de conteúdo, pelo que a vista de um módulo não tem tamanho intrínseco e
  nunca encolhe abaixo do seu estilo, como um controlo. Dê-lhe uma `height` (e uma
  `width`, ou deixe `alignItems: stretch` e `flex` dimensioná-la). Não recebe
  filhos.

### Escrever uma vista

O exemplo é o módulo `Slider`, `native/modules/slider/` (numa aplicação,
`modules/<name>/`).

**1. Declare-a.** As props são um tipo próprio, ao lado da especificação:

```ts
// src/native/slider.ts
export type SliderEvent = NativeViewEvent<'changeEnd', { value: number }>;

export type SliderProps = {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  fillColor?: string;
  onChange?: (value: number) => void;
  onChangeEnd?: (event: SliderEvent) => void;
};
```

```ts
// native/modules/slider/slider.ts
export default defineModule('Slider', {
  view: view<SliderProps>({ events: ['change', 'changeEnd'] }),
  ios: { class: 'KuitoSliderModule' },
  android: { class: 'dev.kuito.runtime.modules.slider.KuitoSliderModule' },
});
```

As props são dados JSON; as props `on*` são handlers. O componente aceita cada prop
como um valor ou um sinal, ao lado das props de estilo, layout e acessibilidade de
todas as vistas.

Uma vista com métodos tipa-os num segundo argumento de tipo e declara cada um
em `methods`, como `fn.main`. Uma ref do tipo handle da vista chama-os
(`native/modules/webview/webview.ts`):

```ts
export default defineModule('WebView', {
  view: view<WebViewProps, WebViewMethods>({
    events: ['loadStart', 'load', 'loadEnd', 'error', 'navigate', 'message'],
    methods: {
      reload: fn.main<() => Promise<void>>(),
      injectJavaScript: fn.main<(script: string) => Promise<void>>(),
    },
  }),
  …
});
```

```tsx
const web = ref<WebViewHandle>();

<WebView ref={web} src="https://example.com" flex={1} />;
await web.current?.reload();
```

**2. Escreva a vista Swift.** O membro `view` da especificação é uma função que
devolve uma `KuitoModuleView`: a classe da vista e as suas props.

```swift
final class KuitoSliderModule: SliderSpec {
    init(context: KuitoModuleContext) {}

    func view() -> KuitoModuleView {
        KuitoModuleView(KuitoSliderView.self) { view in
            view.prop("value") { (slider, value: Double?) in slider.requested = Float(value ?? 0) }
            view.prop("disabled") { (slider, value: Bool?) in slider.isEnabled = !(value ?? false) }
        }
    }
}

final class KuitoSliderView: UISlider, KuitoNativeView {
    private let events: KuitoViewEvents

    init(events: KuitoViewEvents) {
        self.events = events
        super.init(frame: .zero)
        addAction(UIAction { [weak self] _ in self?.slid() }, for: .valueChanged)
    }

    private func slid() {
        events.emit("change", SliderValue(value: Double(value)))
    }
}
```

- A vista conforma-se a `KuitoNativeView`: o Kuito chama `init(events:)` na
  thread principal para cada elemento renderizado.
- O valor de uma prop descodifica para qualquer `Decodable`. Torne-o opcional para aceitar a
  remoção da prop, que chega como null; uma prop não opcional rejeita-a.
- `events.emit` não recebe payload, ou recebe um `Encodable` que codifica para um objeto
  JSON. Emitir um evento que a especificação não declara é um erro de programação
  e provoca um trap. Marque uma propriedade opcional do payload com `@KuitoNullable` para enviar
  `null` em vez de a omitir, como um payload tipado `T | null` espera.
- Cada método é um requisito do protocolo, chamado na thread principal
  com a vista montada em primeiro lugar; faça o cast para a classe da vista
  (`native/modules/webview/ios/KuitoWebViewModule.swift`):

  ```swift
  @MainActor func reload(_ view: UIView) throws {
      guard let web = view as? KuitoWebView else {
          throw KuitoModuleError(KuitoErrorCode.viewNotFound, "The view is not a WebView")
      }
      web.reload()
  }
  ```

**3. Escreva a vista Kotlin.**

```kotlin
class KuitoSliderModule(context: KuitoModuleContext) : SliderSpec {
    override fun view(): KuitoModuleView<*> =
        KuitoModuleView(::KuitoSliderView) { view ->
            view.prop("value", KuitoType.optional(KuitoType.double)) { slider, value -> slider.value = value ?: 0.0 }
            view.prop("disabled", KuitoType.optional(KuitoType.boolean)) { slider, value -> slider.isEnabled = value != true }
        }
}

class KuitoSliderView(context: Context, private val events: KuitoViewEvents) : SeekBar(context) {
    // events.emit("change", mapOf("value" to value)) from a listener
}
```

- `KuitoModuleView` recebe o construtor da vista, `(Context,
  KuitoViewEvents)`, que executa na thread de UI para cada elemento renderizado.
- Cada prop nomeia o seu `KuitoType` (`string`, `boolean`, `int`, `double`,
  `obj`, `array`, `list(…)`, `optional(…)`, `enum(…)`); um valor do tipo errado lança
  `unsupportedValue`. Use `KuitoType.optional` para aceitar a remoção.
- `events.emit(event, payload)` recebe um `Map` de dados JSON, ou nenhum payload.
- Cada método sobrepõe o da interface, na thread de UI com a vista montada
  em primeiro lugar: `override fun reload(view: android.view.View) = web(view).reload()`.

**4. Liberte o que uma vista detém.** Uma vista que detém algo fora de si
(um leitor, uma sessão de câmara) devolve-o em `unmount`. O Kuito chama-o na
thread principal quando remove a vista, e para todas as vistas de módulo quando o
runtime recarrega. A vista pode permanecer no ecrã um momento mais para uma animação
de saída, e não é reutilizada depois.

```swift
final class KuitoPlayerView: UIView, KuitoNativeView {
    func unmount() { player.release() }
}
```

```kotlin
class KuitoPlayerView(context: Context, events: KuitoViewEvents) : FrameLayout(context), KuitoNativeView {
    override fun unmount() = player.release()
}
```

No iOS, `unmount` faz parte de `KuitoNativeView` e não faz nada a menos que a
vista o implemente; no Android, uma vista implementa `KuitoNativeView` apenas para
o ouvir. Sair da janela não é desmontar: uma vista sob um ecrã empurrado,
ou atrás de uma apresentação em ecrã inteiro, continua montada.

**5. Teste o lado JavaScript.** `test/native-views.test.ts` renderiza a
vista de um módulo contra uma plataforma falsa, depois verifica as props que o host
recebe e despacha eventos de volta.

### Uma vista na transmissão

A vista de um módulo atravessa a fronteira do host como o tipo `module:<Name>`
(`module:Slider`), à parte dos tipos incorporados. O seu próprio id regista o
tipo: a tabela de ligação entrega a `KuitoModuleViews` a `KuitoModuleView` com os
eventos da especificação. Um método é uma função ligada da thread principal cujo primeiro argumento
é o número da vista: a plataforma encontra a vista montada em
`KuitoModuleViews`, que contém cada vista de módulo desde a sua criação até que o
renderer a remova, e falha com `ERR_VIEW_NOT_FOUND` quando ela desapareceu.
As props viajam como as de qualquer vista: strings como elas próprias, números e booleanos como
escalares, objetos e arrays como texto JSON; a plataforma descodifica cada um para o
tipo que a prop declara. Cada renderer alcança os tipos de módulo através de uma única costura:
`KuitoViewFactory` cria os tipos incorporados a partir da sua tabela e os tipos de módulo a partir de
`KuitoModuleViews`, e as props próprias de uma vista vivem no seu `KuitoViewStyle`,
à frente de `KuitoProperties`.

## Chamadas a partir de código da thread de UI

O código da aplicação nunca nomeia uma thread ([movimento](motion.md)): um handler de gesto ou scroll
que o compilador coloca na thread de UI chama um módulo como qualquer outro
código. Uma função `fn.main` que devolve o seu resultado (não uma `callback`)
executa aí diretamente, através de `__kuitoUIHostCall`: a thread de UI é a thread
principal, pelo que a plataforma chama o módulo de imediato, sem salto para a thread JS
e de volta, e a chamada responde com uma Promise como faz na thread
JS. `haptics.impact('light')` num handler de scroll toca no frame que
ultrapassou o limiar (`test/motion-app.test.ts`). Qualquer outra função que
o código da thread de UI chama é enviada para a thread JS sem esperar, e usar o seu
resultado na thread de UI é um erro que nomeia a função.

## Valores, sinais e ações

Os membros de uma capacidade seguem uma regra, para que um leitor adivinhe cada um pelo seu
nome:

- **Uma ação é um verbo**: `haptics.impact('light')`, `linking.open(url)`,
  `app.openSettings()`. Uma que espera pela plataforma devolve uma Promise.
  Não há sufixo `Async`.
- **Um facto fixo é uma propriedade**: `device.model`, `haptics.supported`,
  `fileSystem.documents`. É lido uma vez, quando a aplicação arranca; uma aplicação que
  não lê nenhum dos factos de uma capacidade nunca pergunta.
- **Um valor que muda é um sinal**: `appearance.colorScheme`,
  `network.state`, `app.state`, `clipboard.hasText`. Leia `.value`
  de forma síncrona. Um componente segue-o da mesma forma que segue o seu próprio estado: uma
  leitura em JSX, ou `watch(appearance.colorScheme, fn)`. Não há getters,
  setters ou ouvintes para emparelhar com ele, e `watch` é a única forma de seguir
  um.
- **Um sinal gravável** (`brightness.level`, `splash.variant`) aceita uma
  atribuição. Mostra o novo valor de imediato, e uma escrita que a plataforma
  rejeita passa pela costura de erros.
- **Um evento é `watch(event, fn)`** no espaço de nomes quando não é um valor:
  `app.watch('memoryWarning', fn)`.

### Observado apenas enquanto é seguido

Um sinal de estado do sistema começa a observar a plataforma quando o primeiro componente
o subscreve e para quando o último cancela a subscrição: o evento do módulo nativo
por trás dele é iniciado e parado com ele. Sem ser observado, uma leitura pergunta à
plataforma de forma síncrona, pelo que nunca está desatualizada. Começar a observar reporta o
estado de que a plataforma parte, o que apanha uma alteração feita entretanto. Uma
ligação que volta a rastrear as suas leituras mantém a plataforma observada através dela.

A primitiva do kernel é `__kuito.createSource(read, observe)`
(`src/runtime/signals.ts`); `source()` em `src/native/scope.ts` envolve-a para que os
sinais de um módulo não custem nada até à primeira leitura.

### Efeitos de âmbito

Um recurso que não deve sobreviver ao seu utilizador (`keepAwake()`, um leitor de áudio)
é detido pelo componente que o cria:

```tsx
function Reader() {
  keepAwake(); // held from mount until Reader unmounts
  return <Article />;
}

const release = keepAwake({ scope: app }); // the app's, for its life
```

Chamado enquanto um componente se configura, o recurso é criado uma vez para essa chamada
(uma nova renderização ou um Live Patch mantém-no), iniciado quando o componente monta, e
libertado quando o componente desmonta ou a chamada desaparece. Em qualquer outro lugar, a chamada
precisa de `{ scope: app }`: o compilador reporta uma no seu ficheiro e linha
(`src/dev/scope-effects.ts`), no âmbito do módulo, num auxiliar ou num handler,
e o kernel lança para qualquer uma que não tenha conseguido ver, nomeando a correção. A ref de estado
de uma vista (`videoRef()`, `cameraRef()`, `webViewRef()`) não tem âmbito de aplicação: como
`ref()`, só um componente a pode deter. Nada é
`use*`, e nada precisa de um `release()` manual.

A primitiva do kernel é `__kuito.own(label, create, start)`
(`src/runtime/api.ts`): um slot de hook contém o que `create` criou, e o registo de
montagem que `start` devolve liberta-o.

## Como funciona

- **Cada função diz onde executa.** Uma função `fn.sync` executa na thread
  JS e devolve o seu valor diretamente; `fn.main` e `fn.background` executam na
  thread principal ou na thread de fundo em série do próprio módulo, por ordem de
  chamada, e o JavaScript recebe uma Promise. Nada é ponteado por omissão.
- **Os módulos carregam na primeira chamada.** Importar um módulo não atravessa nada. A
  plataforma cria a instância do módulo na primeira vez que uma das suas funções
  executa ou que um dos seus eventos ou valores live é observado, pelo que o arranque nunca
  paga por um módulo que a aplicação ainda não chama.
- **Os argumentos são verificados antes de atravessarem.** O kernel verifica cada
  argumento contra o esquema da função (src/runtime/link.ts) e falha
  com `ERR_ARGUMENT`, nomeando a função, o argumento e o campo: uma
  função, `NaN`, uma `Date` ou uma instância de classe nunca chega ao host. A
  plataforma descodifica o que atravessa para os tipos da especificação, pelo que uma incompatibilidade aí
  falha com o mesmo código em vez de ser convertida.
- **Uma shell tem apenas o que a aplicação chama.** A CLI encontra os módulos incorporados do Kuito
  e os `modules/` da própria aplicação, inclui os módulos que o bundle chama, e
  gera a tabela de ligação. Ninguém edita um registo, o renderer ou a
  shell. Ver [que módulos uma shell inclui](#which-modules-a-shell-includes).

`KuitoThread`, o único enum de threads (`js`, `main`, `background`), é
gerado com o resto do contrato do host a partir de `src/protocol/modules.ts`.

Uma chamada assíncrona começa depois de terminar a tarefa JS que a fez, pelo que as alterações
de vistas que essa tarefa fez chegam primeiro à thread principal: uma função da thread principal
vê-as enfileiradas para o próximo frame, como `splash.hide` confia
([ecrã de arranque](splash.md#until-the-app-is-ready)).

Mantenha as funções síncronas rápidas e thread-safe. Elas bloqueiam o JavaScript enquanto
executam, e não devem tocar no UIKit ou nas Android Views. Use-as para leituras baratas
como `clipboard.hasText` ou `haptics.supported`.

## Escrever o seu próprio módulo

Os módulos de uma aplicação vivem na sua pasta `modules/`, ao lado de `app/`, e nunca nos
ficheiros do próprio Kuito. Crie um com a CLI:

```bash
kuito module create Battery
```

```text
modules/battery/
  battery.ts                the spec
  ios/BatteryModule.swift
  android/BatteryModule.kt
```

O diretório é o nome em kebab case (`BatteryLevel` em
`modules/battery-level/battery-level.ts`), e a especificação tem o mesmo nome: um
diretório sob `modules/` sem a sua especificação falha o build. O scaffold é um
módulo funcional com uma função síncrona, uma da thread principal e um evento.
Importe-o a partir da aplicação e execute `kuito dev`. O resto desta secção transforma-o
num módulo `Battery` com um valor live e uma leitura na thread principal.

### 1. Declare a especificação

`modules/battery/battery.ts`:

```ts
import { defineModule, fn, live } from 'kuito';

export type Reading = { level: number; charging: boolean };

export default defineModule('Battery', {
  /** Low Power Mode on iOS, Battery Saver on Android. */
  lowPower: live<boolean>(),
  /** The charge from 0 to 1, or -1 when unknown. */
  read: fn.main<() => Promise<Reading>>(),
  ios: { class: 'BatteryModule' },
  android: { class: 'com.example.myapp.modules.battery.BatteryModule' },
});
```

### 2. Escreva o módulo Swift

`modules/battery/ios/BatteryModule.swift`:

```swift
import UIKit

final class BatteryModule: BatterySpec {
    private var observer: NSObjectProtocol?

    init(context: KuitoModuleContext) {}

    // ProcessInfo is thread-safe, so the read runs on the JS thread.
    func lowPower() -> Bool {
        ProcessInfo.processInfo.isLowPowerModeEnabled
    }

    @MainActor func read() -> Reading {
        let device = UIDevice.current

        device.isBatteryMonitoringEnabled = true

        return Reading(level: Double(device.batteryLevel), charging: device.batteryState == .charging)
    }

    @MainActor func startLowPower(_ signal: KuitoSignal<Bool>) {
        observer = NotificationCenter.default.addObserver(
            forName: .NSProcessInfoPowerStateDidChange, object: nil, queue: .main
        ) { _ in signal.set(ProcessInfo.processInfo.isLowPowerModeEnabled) }
    }

    @MainActor func stopLowPower() {
        observer.map(NotificationCenter.default.removeObserver)
        observer = nil
    }
}
```

- A classe é `final` e conforma-se à `BatterySpec` gerada; o build
  falha, nomeando o requisito, até que ela implemente todos os membros. Os
  tipos da especificação (`Reading`) são gerados ao lado dela.
- Lance `KuitoModuleError("ERR_BUSY", "…")` para falhar com o seu próprio código. Qualquer
  outro erro chega como `ERR_NATIVE` com a sua descrição.
- Para uma API de callback (um pedido de permissão, uma captura de câmara), declare a
  função `fn.main.callback` e resolva a `KuitoPromise` uma vez, a partir de qualquer
  thread, com `resolve(value)` ou `reject(code, message)`:

  ```swift
  @MainActor func requestAccess(_ promise: KuitoPromise<Bool>) {
      AVCaptureDevice.requestAccess(for: .video) { granted in promise.resolve(granted) }
  }
  ```

- `start<Name>` e `stop<Name>` executam na thread principal: `start` quando o
  primeiro ouvinte ou observador chega, `stop` quando o último sai ou o
  runtime se encerra. O emissor ou sinal pode ser usado a partir de qualquer thread
  entretanto.
- O estado que o ciclo de vida da aplicação detém vem da shell através de um objeto
  partilhado que o módulo observa, como `KuitoLinks` para as ligações recebidas e
  `KuitoAppLifecycle` para o estado de primeiro plano
  ([AppState](app-state.md#how-it-is-wired)). A shell chama as classes de um módulo
  desses, pelo que a sua especificação define `always: true`.
- Os ficheiros em `ios/` compilam no target da aplicação, ao lado dos do próprio Kuito e
  da tabela de ligação gerada, pelo que a API de módulos não precisa de import.

### 3. Escreva o módulo Kotlin

`modules/battery/android/BatteryModule.kt`, num pacote sob o
`applicationId` da aplicação (`kuito module create` escolhe-o):

```kotlin
package com.example.myapp.modules.battery

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.PowerManager
import dev.kuito.link.BatterySpec
import dev.kuito.link.Reading
import dev.kuito.runtime.link.KuitoSignal
import dev.kuito.runtime.modules.KuitoModuleContext

class BatteryModule(context: KuitoModuleContext) : BatterySpec {
    private val app = context.applicationContext
    private val power = app.getSystemService(PowerManager::class.java)
    private var receiver: BroadcastReceiver? = null

    override fun lowPower() = power.isPowerSaveMode

    override fun read(): Reading {
        val battery = app.getSystemService(BatteryManager::class.java)

        return Reading(
            level = battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) / 100.0,
            charging = battery.isCharging,
        )
    }

    override fun startLowPower(signal: KuitoSignal<Boolean>) {
        receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context, intent: Intent) = signal.set(power.isPowerSaveMode)
        }.also { app.registerReceiver(it, IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)) }
    }

    override fun stopLowPower() {
        receiver?.let(app::unregisterReceiver)
        receiver = null
    }
}
```

- A classe recebe o `KuitoModuleContext` e implementa a `BatterySpec`
  gerada; os tipos da especificação estão em `dev.kuito.link`, e os do runtime
  (`KuitoPromise`, `KuitoEmitter`, `KuitoSignal`, `KuitoModuleView`) em
  `dev.kuito.runtime.link`.
- `KuitoModuleError("ERR_BUSY", "…")`, `fn.main.callback`, `destroy()` e
  o threading de `start` e `stop` funcionam da mesma forma que no iOS.
- `context.activity` é a atividade anfitriã. O runtime de uma
  [tarefa em segundo plano](background-tasks.md) não tem nenhuma, e lê-la
  aí falha com `ERR_NO_ACTIVITY`: use `context.applicationContext` para
  tudo o que precise apenas de um `Context` (serviços de sistema, ficheiros, bases de dados).
- Para iniciar outra atividade pelo seu resultado (um seletor de sistema, a câmara),
  chame `KuitoActivityResults.launch(context.activity, contract, input) { output -> … }`
  na thread principal, com qualquer `ActivityResultContract`. Regista um
  callback único no registo de resultados da atividade, pelo que nenhum módulo
  sobrepõe `onActivityResult`. Os pedidos de permissões passam por ele também.

Omita a secção de uma plataforma na especificação, e a sua pasta, para um módulo que
é distribuído numa só plataforma; uma função chamada na outra falha com
`ERR_FUNCTION_NOT_FOUND`. Indique na documentação do módulo que plataforma não o tem.

### 4. Use-o

```tsx
import Battery from './modules/battery/battery';

const reading = await Battery.read();

<Text>{Battery.lowPower.value ? 'Low Power Mode' : `${Math.round(reading.level * 100)}%`}</Text>;
```

`kuito dev` compila o módulo na shell da aplicação. Enquanto executa, guardar um
ficheiro `.swift`, `.kt` ou `.ts` sob `modules/` reconstrói a shell
(incrementalmente: o Xcode e o Gradle recompilam o que mudou) e relança a
aplicação. Um Live Patch que chama uma função que a shell em execução não ligou, como
um primeiro `Battery.read()`, reconstrói a shell também; qualquer outra alteração
TypeScript continua a ser um Live Patch.

### 5. Teste o lado JavaScript

A metade do kernel executa em Node. `test/support/fake-modules.ts` responde às
funções do host da tabela de ligação com uma plataforma falsa, pelo que a lógica da aplicação construída sobre um
módulo é testada sem um dispositivo: `fakeModules({ Camera: { functions: {
takePicture: { thread: 'main', run: () => picture } } } })`, o seu `host`
espalhado no de `installKernel`, e `attach(kernel)` assim que o kernel está
instalado (`test/camera.test.ts`). Numera as especificações incorporadas do Kuito como o
compilador faz. `test/module-calls.test.ts` mostra o lado do kernel de uma chamada
por id.

## Que módulos uma shell inclui

Uma aplicação paga apenas pelos módulos que usa: uma que nunca renderiza um `Video`
nunca distribui o seu Swift, o seu Kotlin ou as suas dependências nativas. A CLI decide
quando constrói a shell (`shellModules`, src/cli/modules.ts):

- **O bundle nomeia o que chama.** Cada stub que fica no bundle da aplicação
  após o tree shaking nomeia um módulo. Importar `haptics` de `kuito` e
  chamar `haptics.impact` mantém esse único stub, e descarta os de `clipboard`.
- **A shell inclui esses módulos, o que eles requerem, e os sempre
  ativos.** Um módulo requer as especificações que a sua própria especificação importa: `Camera` importa
  `Permissions` e `AppState`. `Linking`, `AppState`, `Appearance`,
  `BackgroundTasks`, `Splash`, `SystemUI` e `Window` definem `always`: a própria shell
  chama-os (deep links, o estado de primeiro plano, alterações de traits,
  lançamentos de tarefas em segundo plano, o ecrã de arranque, as barras, o tamanho da janela
  e a área segura).
- **Os módulos da aplicação seguem a mesma regra.** Um módulo em `modules/` que nada
  chama não é compilado. Dois módulos com um mesmo nome, ou duas especificações que declaram um
  tipo com um mesmo nome, falham o build nomeando ambos os ficheiros.

Os módulos incorporados e os da aplicação passam por este único caminho. Os incorporados do Kuito vivem em
`native/modules/<name>/` (kebab case, `native/modules/app-state`), organizados
como os de uma aplicação.

| Gerado (em `.kuito/`)                                                     | A partir de                                                          |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `ios/Generated/KuitoLink.swift`                                           | as especificações dos módulos incluídos, e os ids que o bundle chama |
| `ios/project.json`: fontes, `packages`, frameworks, Info.plist            | o `ios` dos módulos incluídos                                        |
| `android/generated/dev/kuito/link/KuitoLink.kt`                           | as especificações dos módulos incluídos, e os ids que o bundle chama |
| `android/AndroidManifest.xml`, fundido no da framework                    | os `permissions`, `providers` e `services` dos módulos incluídos     |
| `-Pkuito.sources`, `-Pkuito.dependencies` e `-Pkuito.moduleRes` do Gradle | o `android` dos módulos incluídos                                    |

Os ficheiros gerados sem alterações são deixados intactos, para que uma reconstrução se mantenha incremental, e
um ficheiro gerado que nenhum módulo produz mais é eliminado.

### Necessidades nativas

O `ios`, `android` e `always` de uma especificação dizem o que o módulo precisa além das suas
funções. A CLI valida-os antes de construir, e os erros nomeiam a especificação
e a chave; qualquer chave que não esteja abaixo é um erro, para que uma gralha não passe
em silêncio.

```ts
export default defineModule('Camera', {
  // …its members
  ios: {
    class: 'CameraModule',
    swiftPackages: [
      { url: 'https://github.com/example/Lens.git', from: '2.1.0', products: ['Lens'] },
    ],
    infoPlist: { NSCameraUsageDescription: 'Scan codes to join a list' },
  },
  android: {
    class: 'com.example.myapp.modules.camera.CameraModule',
    dependencies: ['androidx.camera:camera-camera2:1.4.1'],
    permissions: ['android.permission.CAMERA'],
    features: [{ name: 'android.hardware.camera.any', required: false }],
    providers: [
      {
        name: 'com.example.myapp.modules.camera.CaptureProvider',
        authorities: '${applicationId}.camera',
        exported: 'false',
        grantUriPermissions: 'true',
        resources: { 'android.support.FILE_PROVIDER_PATHS': '@xml/camera_paths' },
      },
    ],
  },
});
```

| Chave                  | Significado                                                                                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `always`               | `true`: em todas as shells, chamado ou não. Para módulos que a própria shell chama.                                                                                                                                                                                       |
| `ios.class`            | A classe Swift `final` que se conforma à `<Name>Spec` gerada, em `ios/`.                                                                                                                                                                                                  |
| `ios.frameworks`       | Frameworks de sistema que o target da aplicação liga, como `CoreHaptics`.                                                                                                                                                                                                 |
| `ios.swiftPackages`    | Pacotes Swift: `url`, `from` (versão mínima) e os `products` que o target da aplicação liga. As shells iOS não têm CocoaPods.                                                                                                                                             |
| `ios.infoPlist`        | Chaves do Info.plist, como descrições de utilização. Dois módulos não podem definir uma chave de forma diferente, nem o `ios.infoPlist` da aplicação ([definições nativas](apps.md#native-settings)); as razões de `permissions` da aplicação substituem as de um módulo. |
| `android.class`        | A classe Kotlin totalmente qualificada que implementa a `<Name>Spec` gerada, em `android/`.                                                                                                                                                                               |
| `android.dependencies` | Coordenadas Gradle, `group:artifact:version`, adicionadas como `implementation`.                                                                                                                                                                                          |
| `android.permissions`  | Entradas `uses-permission` fundidas no manifesto da aplicação.                                                                                                                                                                                                            |
| `android.features`     | Entradas `uses-feature`: `name`, e `required` (true a menos que diga `false`). O Google Play esconde uma aplicação dos dispositivos sem uma funcionalidade requerida, pelo que um módulo cuja aplicação funciona sem o hardware diz `false`.                              |
| `android.providers`    | `<provider>`s sob `<application>`: atributos sem `android:` (`name` e `authorities` obrigatórios; `${applicationId}` funciona), e `resources`, `<meta-data>` que nomeia um recurso que o módulo distribui em `android/res/`.                                              |
| `android.services`     | `<service>`s sob `<application>`: atributos sem `android:`, `name` obrigatório, como o `foregroundServiceType` de um serviço em primeiro plano.                                                                                                                           |

O diretório `android/res/` de um módulo, quando o tem, junta-se aos recursos da
shell, pelo que os meta-data de um provider podem nomear um ficheiro XML aí. Prefixe os
nomes dos recursos com o do módulo (`kuito_image_picker_paths`): os recursos de todos
os módulos incluídos partilham um único espaço de nomes.

Uma especificação tem de declarar `ios` ou `android`. Uma secção sem a sua pasta de
fontes (`ios/` com ficheiros `.swift`, `android/` com `.kt`), ou fontes
sem a sua secção, é também um erro.

### Adicionar um módulo incorporado

Um módulo distribuído com o Kuito tem as mesmas três partes, em
`native/modules/<name>/`: a especificação `<name>.ts`, que importa `defineModule`
de `src/native/define-module.ts`, e `ios/` e `android/`, com o Kotlin em
`dev.kuito.runtime.modules.<name>`. A API da aplicação é um espaço de nomes em
`src/native/<name>.ts` que reexporta os membros da especificação um a um,
exportado de `src/native/index.ts`, para que uma aplicação que não chama nenhum deles descarte
o módulo. Defina `always` apenas quando o código da própria shell chama as classes
do módulo.

## Erros

<!-- error codes: generated from src/protocol/modules.ts -->

| Código                   | Significado                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `ERR_FUNCTION_NOT_FOUND` | A tabela de ligação da shell não contém a função: reconstrua-a.                                   |
| `ERR_VIEW_NOT_FOUND`     | A vista de uma função de vista não está montada.                                                  |
| `ERR_ARGUMENT`           | Um argumento não descodificou para o tipo declarado.                                              |
| `ERR_ENCODE`             | Um resultado ou payload de evento não é JSON.                                                     |
| `ERR_NATIVE`             | A função lançou algo diferente de `KuitoModuleError`.                                             |
| `ERR_THREAD`             | Uma chamada síncrona chegou a uma função assíncrona.                                              |
| `ERR_NO_ACTIVITY`        | O módulo precisa da atividade, e uma tarefa em segundo plano executa sem nenhuma. Apenas Android. |

<!-- end of generated error codes -->

Uma função síncrona lança o seu erro na chamada. Uma assíncrona
rejeita. Os argumentos que não correspondem à especificação falham no kernel, antes de
qualquer coisa atravessar, com o `ERR_ARGUMENT` do host. De qualquer forma, o erro é um
`NativeModuleError` com `code`, e a sua
mensagem nomeia o módulo e a função (`Clipboard.writeText failed: …`): os
nomes próprios do módulo nativo, que o espaço de nomes envolve. Um ouvinte de evento que
lança é reportado ao LogBox, e os outros ouvintes continuam a executar.

## Formato de transmissão

Uma função de módulo atravessa a fronteira do host pelo seu id, de
`src/runtime/link.ts` através de `native/shared/KuitoRuntime.cpp` até ao linker de cada
plataforma (`KuitoLinker`) e ao seu `KuitoLink` gerado:

| Função do host                            | Devolve                                                                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `__kuitoHostCall(id, ...args)`            | o resultado de uma função `js`; uma falha lança `__kuitoLinkError(id, code, message)`                                             |
| `__kuitoHostCallAsync(id, call, ...args)` | nada; o host chama mais tarde `__kuitoLinkSettle(call, value)` ou `__kuitoLinkFail(call, code, message)`                          |
| `__kuitoHostObserve(id, observing)`       | nada; enquanto observa, o host chama `__kuitoLinkEmit(id, value)` para um evento ou um valor live                                 |
| `__kuitoUIHostCall(id, ...args)`          | na thread de UI, o resultado de uma função `main`, executada de imediato ([chamadas da thread de UI](#calls-from-ui-thread-code)) |

Os valores atravessam como valores JSI tipados (native/shared/Link.h, LinkJSI.h): null,
booleanos, números e strings como eles próprios, o primeiro nível de um objeto como os seus
campos, e apenas os dados aninhados como texto JSON. Os resultados voltam da mesma forma. Uma
falha é a única resposta com um código e uma mensagem. Um host sem estas
funções (o host `node:vm` dos testes) não tem módulos nativos, pelo que um módulo falha
aí na primeira utilização com uma mensagem que o diz.

## A API de módulos é versionada

Os módulos nativos são o contrato público estável do Kuito: **API de módulos 1**. Os módulos
de uma aplicação, e mais tarde os pacotes de módulos de terceiros, dependem dele, pelo que só muda
de formas que mantenham os módulos existentes a compilar e a comportar-se da mesma maneira. O
contrato é:

- a especificação: `defineModule`, `fn.sync`, `fn.main`, `fn.background` e os seus
  `.callback`, `event`, `live` e `view`, os tipos que uma especificação pode usar e as suas
  [necessidades nativas](#native-needs);
- o protocolo e a interface `<Name>Spec` gerados, e como cada membro se mapeia
  neles;
- `KuitoLinkedModule` (`init(context:)`, `destroy()`), `KuitoModuleContext`,
  `KuitoModuleError`, `KuitoPromise`, `KuitoEmitter`, `KuitoSignal`,
  `KuitoModuleView` com `KuitoNativeView` e `KuitoViewEvents`, e
  `KuitoType` e `KuitoActivityResults` do Kotlin;
- os códigos de erro acima (`KuitoErrorCode` em Swift e Kotlin).

Dentro da versão 1, as alterações apenas acrescentam: uma nova declaração, uma nova necessidade nativa, um
novo código de erro. Uma alteração que quebraria um módulo é distribuída como API 2, listada
aqui com o que mudar. Tudo o resto, incluindo as funções do host no
[formato de transmissão](#wire-format) e os ids da tabela de ligação, é interno e
pode mudar em qualquer versão.
