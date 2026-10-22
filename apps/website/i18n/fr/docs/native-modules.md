# Modules natifs

Un module natif est du code de plateforme qu'une application appelle : une
classe Swift sur iOS, une classe Kotlin sur Android, et une spec TypeScript
qui déclare les deux et les type pour l'application. Les capacités propres
de Kuito sont construites ainsi et livrées sous forme d'espaces de noms en
minuscules de fonctions et de signaux : `haptics`, `clipboard`,
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
[`alert()` et `prompt()`](alert.md), [`actionSheet()`](action-sheet.md) et [`audio`](audio.md).
Un module peut aussi fournir une vue qu'une application rend en JSX
([vues](#views)), comme le font [`Camera`](camera.md),
[`WebView`](webview.md) et [`Video`](video.md). Un module qui a besoin d'une
permission à l'exécution la demande nativement via `KuitoPermissions` ; voir
[permissions](permissions.md#from-another-module).

```tsx
import { Text, clipboard, haptics } from 'kuito';

console.log(await clipboard.readText());
await clipboard.writeText('https://www.tvmaze.com');
void haptics.selection();

<Text>{clipboard.hasText.value ? 'Paste' : 'Nothing to paste'}</Text>;
```

Chaque capacité est un espace de noms du point d'entrée racine, un fichier
exportant ses fonctions une par une, de sorte qu'un bundle ne conserve que
les fonctions qu'il appelle.

## La spec d'un module

Un module est déclaré une seule fois, en TypeScript, et lié par id : le
compilateur lit la spec sans l'exécuter, le bundle conserve un stub pour
chaque fonction que l'application appelle, et le shell compile une table de
liaison contenant uniquement celles-ci. Rien n'est dispatché par nom.

`modules/battery/battery.ts`, la spec, nommée comme son répertoire :

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

| Déclaration             | S'exécute sur                             | JavaScript reçoit | Nativement                                    |
| ----------------------- | ----------------------------------------- | ----------------- | --------------------------------------------- |
| `fn.sync`               | le thread JS                              | la valeur         | retourne la valeur                            |
| `fn.main`               | le thread principal (UI)                  | une Promise       | retourne la valeur, `@MainActor`              |
| `fn.background`         | le thread d'arrière-plan sériel du module | une Promise       | retourne la valeur                            |
| `fn.main.callback`, ... | démarre sur son thread                    | une Promise       | règle une `KuitoPromise` une fois, plus tard |

Outre les fonctions, une spec déclare ce que la plateforme envoie :

- **`event<Payload>()`**, un événement : `low.addListener(fn)` retourne un
  abonnement. La plateforme l'envoie depuis le premier écouteur jusqu'au
  retrait du dernier : nativement, `startLow(_ emitter: KuitoEmitter<LowBattery>)`
  et `stopLow()` s'exécutent sur le thread principal, et `emitter.send(payload)`
  peut être appelé depuis n'importe quel thread entre les deux. `event()` sans
  type n'a pas de payload.
- **`live<T>()`**, un état de la plateforme qu'une application lit comme un
  signal (`battery.charging.value`). Non observé, chaque lecture appelle
  `charging()` sur le thread JS, il n'est donc jamais périmé ; tant que quelque
  chose l'observe, `startCharging(_ signal: KuitoSignal<Bool>)` s'exécute sur
  le thread principal et `signal.set(value)` écrit le signal à travers le
  noyau. `live`, et non `signal` : `signal()` crée un signal propre à
  l'application.
- **`view<Props, Methods>({ events, methods })`**, une vue que l'application
  rend en JSX ([vues](#views)).

### Ce qu'une spec peut contenir

Le compilateur lit la spec telle qu'elle est écrite (src/dev/modules/spec.ts),
elle ne contient donc que des imports, des types et son export par défaut,
`defineModule`, dont chaque valeur est un littéral. Une instruction qui
s'exécuterait est une erreur de build à sa ligne, de même que tout ce qui,
ci-dessous, ne peut être partagé par les plateformes.

- **Le nom** est un littéral de chaîne en PascalCase : `Battery` est ce que
  Swift et Kotlin implémentent sous le nom `BatterySpec`.
- **Les paramètres et les résultats** sont `number`, `string`, `boolean`,
  `Json`, des tableaux, `Record<string, T>`, `T | null`, des paramètres et
  champs optionnels, et des types nommés. Une union de chaînes déclarée avec
  `type` devient une énumération (`Mode` : `.saver` en Swift, `Mode.SAVER` en
  Kotlin), et un type objet déclaré avec `type` ou `interface` une struct ou
  une data class. Une union ou un objet en ligne est une erreur qui suggère
  l'alias ; un générique, `extends`, un type fonction ou un type qui se
  contient lui-même est aussi une erreur.
- **Les noms de membres** sont des identifiants Swift et Kotlin, chacun
  déclaré une seule fois. `then` et `default` sont réservés, de même que
  `always`, `ios` et `android`, qui contiennent les
  [besoins natifs](#native-needs) du module.
- **La méthode d'une vue** s'exécute sur le thread principal avec la vue,
  c'est donc une `fn.main`, et elle ne peut pas porter le nom d'un membre de
  l'élément de la vue (`id`, `focus`, `addEventListener`, ...).
- **Un import d'une autre spec** est un module que celui-ci requiert
  nativement (`import '../permissions/permissions'`) : le shell l'inclut
  aussi.

Une application importe l'export par défaut de la spec, le module, et appelle
ses membres : `import Battery from './modules/battery/battery'` et
`Battery.read()`. Ses types sont ceux de la spec ; le bundle ne conserve
toujours que les membres appelés. Les capacités propres de Kuito
réexportent les leurs depuis leur espace de noms (`haptics.impact`,
`clipboard.hasText`).

### Ce que le compilateur génère

- **Un stub par membre**, à la place de la spec : `const read =
  /* @__PURE__ */ globalThis.__kuito.link(3, "Battery.read", "js", [])`, son
  id, son thread et son schéma d'arguments (src/dev/modules/stubs.ts). Les
  événements, les valeurs live et les vues ont les leurs (`linkEvent`,
  `linkLive`, `linkView`). Les ids numérotent chaque membre de chaque module
  que l'application peut appeler, par nom de module, puis par ordre de
  déclaration, une vue puis chacune de ses méthodes
  (src/dev/modules/catalog.ts). Chaque stub est pur, de sorte que le bundler
  supprime tous ceux que l'application n'appelle pas ; les ids encore
  présents dans le bundle après l'élimination du code mort constituent la
  table de liaison du shell (src/dev/modules/plugin.ts).
- **Un protocole Swift et une interface Kotlin par module**, `BatterySpec:
  KuitoLinkedModule`, avec les énumérations et les structs de la spec
  (src/cli/link-swift.ts, link-kotlin.ts). La classe que nomment `ios.class`
  et `android.class` s'y conforme ; une classe qui a dérivé de sa spec fait
  échouer le build natif, en nommant la méthode :

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

  Les types Kotlin sont dans `dev.kuito.link` (`import dev.kuito.link.BatterySpec`).
  Les nombres sont des `Double`, `Json` est `Any` en Swift et `Any?` en
  Kotlin, et un champ optionnel est un optionnel Swift ou un nullable Kotlin
  valant null par défaut.

- **`destroy()`**, que la classe d'un module peut implémenter, s'exécute sur
  le thread principal quand le runtime s'arrête (un rechargement, ou la
  fermeture de l'application), après l'arrêt de ses observateurs : restituez
  ce que le module détient en dehors du runtime, comme `keepAwake` restitue
  le minuteur d'inactivité.
- **La table de liaison**, `ios/Generated/KuitoLink.swift` et
  `android/generated/dev/kuito/link/KuitoLink.kt` dans `.kuito/` :
  `KuitoLink.function(id)` contient une `KuitoFunction(name, thread:, arity:,
  run:)` par id de fonction que le bundle appelle, qui décode les arguments
  dans les types de la spec, appelle le module et encode son résultat, et
  `KuitoLink.observer(id)` une entrée par événement et valeur live qu'il
  observe. L'instance d'un module est créée, avec `init(context:)`, à son
  premier appel. Un fichier généré qu'un build n'écrit plus est supprimé.

Un Live Patch qui appelle une fonction que le shell en cours d'exécution n'a
pas liée, ou un changement de spec qui les renumérote, reconstruit le shell.

### Ce qu'une release embarque

Le tree shaking opère au niveau des fonctions. Le bundle ne contient un stub
que pour chaque membre que l'application appelle ; un module dont aucun
membre n'est appelé n'est pas du tout compilé dans le shell, sauf s'il est
[toujours actif ou requis](#which-modules-a-shell-includes). D'un module qui
l'est, les builds de release ne conservent que ce que la table de liaison
atteint. Sur Android, R8 réduit l'application et
`native/android/app/proguard-rules.pro` ne conserve rien par nom au-delà des
points d'entrée JNI, de sorte qu'une fonction qu'aucune entrée n'appelle est
supprimée. Sur iOS, un build Release optimise le module entier et lie avec
`-dead_strip` : la table de liaison n'atteint un module qu'à travers le
protocole de sa spec, de sorte que le témoin d'une exigence qu'aucune entrée
n'appelle, et la méthode derrière lui, sont éliminés. Rien ici n'est `@objc`
ni ouvert au sous-classage, ce qui les garderait en vie. Un build Debug
conserve tout.

## Vues

Un module peut fournir une vue : une `UIView` sur iOS et une `View` Android,
rendue en JSX comme n'importe quelle primitive. Elle accepte les props de
style et de disposition, le moteur flexbox partagé la positionne, et ses
événements arrivent sous forme de props `on*`. Rien ne change dans les
renderers pour en ajouter une. `Slider` est livré avec Kuito et construit
de cette façon.

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

### Comment fonctionnent les vues

- **Une vue est un membre de la spec de son module.** `view: view<SliderProps>({
  events: ['change', 'changeEnd'] })` la déclare, et l'application rend la
  `view` du module (`Slider` est `SliderModule.view`). Un module a au plus une
  vue, et peut avoir des fonctions et des événements à côté d'elle.
- **Elle s'enregistre au premier rendu.** Importer la vue ne traverse rien.
  Quand le noyau en planifie une pour la première fois, il appelle l'id
  propre de la vue, et la plateforme enregistre le type (`module:Slider`)
  auprès du renderer, avec les événements que la spec déclare.
- **Ses props sont une table indexée par nom de prop,** comme les tables
  `properties/` du renderer. Les props de la vue viennent en premier, puis
  les tables partagées (disposition, décoration, accessibilité, gestes...),
  de sorte que `width`, `margin`, `opacity` ou `label` fonctionnent sur elle
  sans changement. Une prop que la vue ne déclare pas et qu'aucune table
  partagée ne possède lève `unsupportedProp`, et une valeur qui ne se décode
  pas dans le type déclaré `unsupportedValue`
  ([renderer natif](native-renderer.md#errors)).
- **Ses props `on*` sont les événements qu'elle déclare.** `onChangeEnd`
  écoute `changeEnd`. Le gestionnaire reçoit l'événement (`type`, `target`)
  avec les champs du payload dessus, sauf `onChange`, qui reçoit la `value`
  du payload, comme ceux d'un TextField et d'un Toggle. Une prop liée à un
  signal est bidirectionnelle : un événement dont le payload a un champ du
  nom de la prop l'écrit. Une prop `on*` pour un événement que la vue ne
  déclare pas est une erreur qui liste ceux qu'elle déclare. La prop
  `gestures` attache toujours des gestes ; les autres props d'événement
  (`onPress`, ...) ne signifient rien sur la vue d'un module à moins qu'elle
  ne déclare cet événement. Les événements empruntent le
  [format de transport des événements](events.md#wire-format).
- **Ses méthodes sont des méthodes de sa ref.** Ce que les props ne peuvent
  pas exprimer (prendre une photo, se positionner dans une vidéo, recharger
  une page), une vue le déclare dans `methods`. Son élément, la valeur que
  détient sa `ref`, y répond à côté de `id` et `addEventListener` ; chacune
  retourne une Promise et s'exécute sur le thread principal avec cette vue.
  Un appel sur une vue qui n'est plus montée est rejeté sans traverser.
- **C'est une feuille, dimensionnée par son style.** Le moteur de disposition
  ne peut pas demander une taille de contenu à une caméra ou à une vue web,
  donc la vue d'un module n'a pas de taille intrinsèque et ne rétrécit jamais
  en dessous de son style, comme un contrôle. Donnez-lui une `height` (et une
  `width`, ou laissez `alignItems: stretch` et `flex` la dimensionner). Elle
  ne prend pas d'enfants.

### Écrire une vue

L'exemple est le module `Slider`, `native/modules/slider/` (dans une
application, `modules/<name>/`).

**1. Déclarez-la.** Les props sont un type à part, à côté de la spec :

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

Les props sont des données JSON ; les props `on*` sont des gestionnaires. Le
composant accepte chaque prop comme une valeur ou un signal, à côté des props
de style, de disposition et d'accessibilité de toute vue.

Une vue avec des méthodes les type dans un second argument de type et déclare
chacune dans `methods`, comme `fn.main`. Une ref du type handle de la vue les
appelle (`native/modules/webview/webview.ts`) :

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

**2. Écrivez la vue Swift.** Le membre `view` de la spec est une fonction qui
retourne une `KuitoModuleView` : la classe de la vue et ses props.

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

- La vue se conforme à `KuitoNativeView` : Kuito appelle `init(events:)`
  sur le thread principal pour chaque élément rendu.
- La valeur d'une prop se décode dans n'importe quel `Decodable`. Rendez-la
  optionnelle pour accepter le retrait de la prop, qui arrive sous forme de
  null ; une prop non optionnelle le rejette.
- `events.emit` ne prend pas de payload, ou un `Encodable` qui s'encode en
  objet JSON. Émettre un événement que la spec ne déclare pas est une erreur
  de programmation et provoque un trap. Marquez une propriété de payload
  optionnelle `@KuitoNullable` pour envoyer `null` plutôt que de l'omettre,
  comme l'attend un payload typé `T | null`.
- Chaque méthode est une exigence du protocole, appelée sur le thread
  principal avec la vue montée en premier argument ; castez-la vers la classe
  de la vue (`native/modules/webview/ios/KuitoWebViewModule.swift`) :

  ```swift
  @MainActor func reload(_ view: UIView) throws {
      guard let web = view as? KuitoWebView else {
          throw KuitoModuleError(KuitoErrorCode.viewNotFound, "The view is not a WebView")
      }
      web.reload()
  }
  ```

**3. Écrivez la vue Kotlin.**

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

- `KuitoModuleView` prend le constructeur de la vue, `(Context,
  KuitoViewEvents)`, qui s'exécute sur le thread UI pour chaque élément
  rendu.
- Chaque prop nomme son `KuitoType` (`string`, `boolean`, `int`, `double`,
  `obj`, `array`, `list(…)`, `optional(…)`, `enum(…)`) ; une valeur du mauvais
  type lève `unsupportedValue`. Utilisez `KuitoType.optional` pour accepter
  le retrait.
- `events.emit(event, payload)` prend une `Map` de données JSON, ou pas de
  payload.
- Chaque méthode surcharge celle de l'interface, sur le thread UI avec la vue
  montée en premier argument : `override fun reload(view: android.view.View) = web(view).reload()`.

**4. Libérez ce qu'une vue détient.** Une vue qui détient quelque chose en
dehors d'elle-même (un lecteur, une session caméra) le restitue dans
`unmount`. Kuito l'appelle sur le thread principal quand il retire la vue,
et pour chaque vue de module quand le runtime se recharge. La vue peut rester
à l'écran un instant de plus pour une animation de sortie, et n'est pas
réutilisée ensuite.

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

Sur iOS, `unmount` fait partie de `KuitoNativeView` et ne fait rien à moins
que la vue ne l'implémente ; sur Android, une vue n'implémente
`KuitoNativeView` que pour l'entendre. Quitter la fenêtre n'est pas un
démontage : une vue sous un écran empilé, ou derrière une présentation en
plein écran, est toujours montée.

**5. Testez le côté JavaScript.** `test/native-views.test.ts` rend la vue
d'un module contre une fausse plateforme, puis vérifie les props que l'hôte
reçoit et lui renvoie des événements.

### Une vue sur le fil

La vue d'un module traverse la frontière de l'hôte sous le type
`module:<Name>` (`module:Slider`), à part des types intégrés. Son propre id
enregistre le type : la table de liaison remet à `KuitoModuleViews` la
`KuitoModuleView` avec les événements de la spec. Une méthode est une
fonction liée sur le thread principal dont le premier argument est le numéro
de la vue : la plateforme trouve la vue montée dans `KuitoModuleViews`, qui
détient chaque vue de module de sa création jusqu'à ce que le renderer la
retire, et échoue avec `ERR_VIEW_NOT_FOUND` quand elle a disparu. Les props
voyagent comme celles de n'importe quelle vue : les chaînes telles quelles,
les nombres et les booléens comme scalaires, les objets et les tableaux
comme texte JSON ; la plateforme décode chacune dans le type que la prop
déclare. Chaque renderer atteint les types de module à travers une seule
jointure : `KuitoViewFactory` crée les types intégrés à partir de sa table
et les types de module à partir de `KuitoModuleViews`, et les props propres
d'une vue vivent sur son `KuitoViewStyle`, avant `KuitoProperties`.

## Appels depuis du code sur le thread UI

Le code de l'application ne nomme jamais un thread ([motion](motion.md)) : un
gestionnaire de geste ou de défilement que le compilateur place sur le thread
UI appelle un module comme n'importe quel autre code. Une fonction `fn.main`
qui retourne son résultat (pas une `callback`) s'y exécute directement, via
`__kuitoUIHostCall` : le thread UI est le thread principal, la plateforme
appelle donc le module immédiatement, sans aller-retour vers le thread JS,
et l'appel répond avec une Promise comme il le fait sur le thread JS.
`haptics.impact('light')` dans un gestionnaire de défilement joue dans la
frame qui a franchi le seuil (`test/motion-app.test.ts`). Toute autre
fonction que le code du thread UI appelle est envoyée au thread JS sans
attendre, et utiliser son résultat sur le thread UI est une erreur qui nomme
la fonction.

## Valeurs, signaux et actions

Les membres d'une capacité suivent une seule règle, de sorte qu'un lecteur
devine chacun d'après son nom :

- **Une action est un verbe** : `haptics.impact('light')`, `linking.open(url)`,
  `app.openSettings()`. Celle qui attend la plateforme retourne une Promise.
  Il n'y a pas de suffixe `Async`.
- **Un fait fixe est une propriété** : `device.model`, `haptics.supported`,
  `fileSystem.documents`. Elle est lue une fois, au démarrage de
  l'application ; une application qui ne lit aucun des faits d'une capacité
  ne demande jamais.
- **Une valeur qui change est un signal** : `appearance.colorScheme`,
  `network.state`, `app.state`, `clipboard.hasText`. Lisez `.value` de façon
  synchrone. Un composant le suit comme il suit son propre état : une lecture
  en JSX, ou `watch(appearance.colorScheme, fn)`. Il n'y a pas de getters, de
  setters ni d'écouteurs à lui associer, et `watch` est la seule façon d'en
  suivre un.
- **Un signal en écriture** (`brightness.level`, `splash.variant`) accepte
  une affectation. Il montre la nouvelle valeur immédiatement, et une
  écriture que la plateforme rejette passe par la jointure d'erreur.
- **Un événement est `watch(event, fn)`** sur l'espace de noms quand ce n'est
  pas une valeur : `app.watch('memoryWarning', fn)`.

### Observé seulement tant qu'il est suivi

Un signal d'état système commence à observer la plateforme quand le premier
composant s'y abonne et s'arrête quand le dernier se désabonne : l'événement
de module natif derrière lui est démarré et arrêté avec lui. Non observée,
une lecture interroge la plateforme de façon synchrone, elle n'est donc
jamais périmée. Le début de l'observation rapporte l'état d'où part la
plateforme, ce qui rattrape un changement survenu entre-temps. Une liaison
qui re-suit ses lectures maintient la plateforme observée à travers elle.

La primitive du noyau est `__kuito.createSource(read, observe)`
(`src/runtime/signals.ts`) ; `source()` dans `src/native/scope.ts`
l'enveloppe de sorte que les signaux d'un module ne coûtent rien avant leur
première lecture.

### Effets de portée

Une ressource qui ne doit pas survivre à son utilisateur (`keepAwake()`, un
lecteur audio) appartient au composant qui la crée :

```tsx
function Reader() {
  keepAwake(); // held from mount until Reader unmounts
  return <Article />;
}

const release = keepAwake({ scope: app }); // the app's, for its life
```

Appelée pendant qu'un composant se met en place, la ressource est créée une
fois pour cet appel (un nouveau rendu ou un Live Patch la conserve), démarrée
quand le composant est monté, et libérée quand le composant est démonté ou
que l'appel disparaît. Partout ailleurs, l'appel a besoin de
`{ scope: app }` : le compilateur en signale un à son fichier et sa ligne
(`src/dev/scope-effects.ts`), à la portée du module, dans un helper ou dans
un gestionnaire, et le noyau lève une exception pour tout appel qu'il n'a pas
pu voir, en nommant le correctif. La ref d'état d'une vue (`videoRef()`,
`cameraRef()`, `webViewRef()`) n'a pas de portée application : comme
`ref()`, seul un composant peut la posséder. Rien n'est `use*`, et rien n'a
besoin d'un `release()` manuel.

La primitive du noyau est `__kuito.own(label, create, start)`
(`src/runtime/api.ts`) : un emplacement de hook détient ce que `create` a
créé, et l'enregistrement de montage que `start` retourne le libère.

## Comment ça fonctionne

- **Chaque fonction dit où elle s'exécute.** Une fonction `fn.sync` s'exécute
  sur le thread JS et retourne directement sa valeur ; `fn.main` et
  `fn.background` s'exécutent sur le thread principal ou sur le thread
  d'arrière-plan sériel propre au module, dans l'ordre des appels, et
  JavaScript reçoit une Promise. Rien n'est bridgé par défaut.
- **Les modules se chargent au premier appel.** Importer un module ne
  traverse rien. La plateforme crée l'instance du module la première fois
  qu'une de ses fonctions s'exécute ou qu'un de ses événements ou valeurs
  live est observé, de sorte que le démarrage ne paie jamais pour un module
  que l'application n'appelle pas encore.
- **Les arguments sont vérifiés avant de traverser.** Le noyau vérifie chaque
  argument contre le schéma de la fonction (src/runtime/link.ts) et échoue
  avec `ERR_ARGUMENT`, en nommant la fonction, l'argument et le champ : une
  fonction, `NaN`, une `Date` ou une instance de classe n'atteint jamais
  l'hôte. La plateforme décode ce qui traverse dans les types de la spec, de
  sorte qu'une incohérence à ce niveau échoue avec le même code au lieu
  d'être castée.
- **Un shell ne contient que ce que l'application appelle.** La CLI trouve
  les modules intégrés de Kuito et le dossier `modules/` propre à
  l'application, inclut les modules que le bundle appelle, et génère la table
  de liaison. Personne n'édite un registre, le renderer ou le shell. Voir
  [quels modules un shell inclut](#which-modules-a-shell-includes).

`KuitoThread`, l'unique énumération de thread (`js`, `main`, `background`),
est générée avec le reste du contrat de l'hôte à partir de
`src/protocol/modules.ts`.

Un appel asynchrone démarre après la fin de la tâche JS qui l'a fait, de
sorte que les changements de vue effectués par cette tâche atteignent le
thread principal en premier : une fonction sur le thread principal les voit
en attente pour la frame suivante, comme `splash.hide` s'y fie
([écran de démarrage](splash.md#until-the-app-is-ready)).

Gardez les fonctions synchrones rapides et thread-safe. Elles bloquent
JavaScript pendant leur exécution, et elles ne doivent pas toucher à UIKit
ni aux Android Views. Utilisez-les pour des lectures peu coûteuses comme
`clipboard.hasText` ou `haptics.supported`.

## Écrire votre propre module

Les modules d'une application vivent dans son dossier `modules/`, à côté de
`app/`, et jamais dans les fichiers propres de Kuito. Créez-en un avec la
CLI :

```bash
kuito module create Battery
```

```text
modules/battery/
  battery.ts                the spec
  ios/BatteryModule.swift
  android/BatteryModule.kt
```

Le répertoire est le nom en kebab case (`BatteryLevel` dans
`modules/battery-level/battery-level.ts`), et la spec est nommée comme lui :
un répertoire sous `modules/` sans sa spec fait échouer le build. Le
squelette est un module fonctionnel avec une fonction synchrone, une sur le
thread principal et un événement. Importez-le depuis l'application et lancez
`kuito dev`. La suite de cette section le transforme en un module `Battery`
avec une valeur live et une lecture sur le thread principal.

### 1. Déclarer la spec

`modules/battery/battery.ts` :

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

### 2. Écrire le module Swift

`modules/battery/ios/BatteryModule.swift` :

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

- La classe est `final` et se conforme à la `BatterySpec` générée ; le build
  échoue, en nommant l'exigence, tant qu'elle n'implémente pas chaque
  membre. Les types de la spec (`Reading`) sont générés à côté.
- Levez `KuitoModuleError("ERR_BUSY", "…")` pour échouer avec votre propre
  code. Toute autre erreur arrive sous `ERR_NATIVE` avec sa description.
- Pour une API à callback (une demande de permission, une capture caméra),
  déclarez la fonction `fn.main.callback` et réglez la `KuitoPromise` une
  seule fois, depuis n'importe quel thread, avec `resolve(value)` ou
  `reject(code, message)` :

  ```swift
  @MainActor func requestAccess(_ promise: KuitoPromise<Bool>) {
      AVCaptureDevice.requestAccess(for: .video) { granted in promise.resolve(granted) }
  }
  ```

- `start<Name>` et `stop<Name>` s'exécutent sur le thread principal : `start`
  quand le premier écouteur ou observateur arrive, `stop` quand le dernier
  part ou que le runtime s'arrête. L'émetteur ou le signal peut être utilisé
  depuis n'importe quel thread entre les deux.
- L'état que possède le cycle de vie de l'application vient du shell à
  travers un objet partagé que le module observe, comme `KuitoLinks` pour
  les liens entrants et `KuitoAppLifecycle` pour l'état de premier plan
  ([AppState](app-state.md#how-it-is-wired)). Le shell appelle les classes
  d'un tel module, sa spec définit donc `always: true`.
- Les fichiers dans `ios/` sont compilés dans la cible de l'application, à
  côté de ceux de Kuito et de la table de liaison générée, de sorte que
  l'API de module n'a besoin d'aucun import.

### 3. Écrire le module Kotlin

`modules/battery/android/BatteryModule.kt`, dans un package sous
l'`applicationId` de l'application (`kuito module create` le choisit) :

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

- La classe prend le `KuitoModuleContext` et implémente la `BatterySpec`
  générée ; les types de la spec sont dans `dev.kuito.link`, et ceux du
  runtime (`KuitoPromise`, `KuitoEmitter`, `KuitoSignal`,
  `KuitoModuleView`) dans `dev.kuito.runtime.link`.
- `KuitoModuleError("ERR_BUSY", "…")`, `fn.main.callback`, `destroy()` et
  le threading de `start` et `stop` fonctionnent comme sur iOS.
- `context.activity` est l'activité hôte. Le runtime d'une
  [tâche d'arrière-plan](background-tasks.md) n'en a pas, et la lire là
  échoue avec `ERR_NO_ACTIVITY` : utilisez `context.applicationContext` pour
  tout ce qui n'a besoin que d'un `Context` (services système, fichiers,
  bases de données).
- Pour démarrer une autre activité pour son résultat (un sélecteur système,
  la caméra), appelez
  `KuitoActivityResults.launch(context.activity, contract, input) { output -> … }`
  sur le thread principal, avec n'importe quel `ActivityResultContract`. Il
  enregistre un callback à usage unique auprès du registre de résultats de
  l'activité, de sorte qu'aucun module ne surcharge `onActivityResult`. Les
  demandes de permission passent aussi par là.

Omettez la section d'une plateforme de la spec, et son dossier, pour un
module livré sur une seule plateforme ; une fonction appelée sur l'autre
échoue avec `ERR_FUNCTION_NOT_FOUND`. Indiquez quelle plateforme en est
dépourvue dans la documentation du module.

### 4. L'utiliser

```tsx
import Battery from './modules/battery/battery';

const reading = await Battery.read();

<Text>{Battery.lowPower.value ? 'Low Power Mode' : `${Math.round(reading.level * 100)}%`}</Text>;
```

`kuito dev` compile le module dans le shell de l'application. Pendant qu'il
tourne, enregistrer un fichier `.swift`, `.kt` ou `.ts` sous `modules/`
reconstruit le shell (de façon incrémentale : Xcode et Gradle recompilent ce
qui a changé) et relance l'application. Un Live Patch qui appelle une
fonction que le shell en cours d'exécution n'a pas liée, comme un premier
`Battery.read()`, reconstruit aussi le shell ; tout autre changement
TypeScript reste un Live Patch.

### 5. Tester le côté JavaScript

La moitié du noyau s'exécute dans Node. `test/support/fake-modules.ts`
répond aux fonctions hôte de la table de liaison avec une fausse plateforme,
de sorte que la logique applicative construite sur un module est testée sans
appareil : `fakeModules({ Camera: { functions: {
takePicture: { thread: 'main', run: () => picture } } } })`, son `host`
étalé dans celui d'`installKernel`, et `attach(kernel)` une fois le noyau
installé (`test/camera.test.ts`). Il numérote les specs intégrées de Kuito
comme le fait le compilateur. `test/module-calls.test.ts` montre le côté du
noyau d'un appel par id.

## Quels modules un shell inclut

Une application ne paie que pour les modules qu'elle utilise : une qui ne
rend jamais de `Video` n'embarque jamais son Swift, son Kotlin ni ses
dépendances natives. La CLI décide quand elle construit le shell
(`shellModules`, src/cli/modules.ts) :

- **Le bundle nomme ce qu'il appelle.** Chaque stub restant dans le bundle de
  l'application après le tree shaking nomme un module. Importer `haptics`
  depuis `kuito` et appeler `haptics.impact` conserve ce seul stub, et
  supprime ceux de `clipboard`.
- **Le shell inclut ces modules, ce qu'ils requièrent, et ceux toujours
  actifs.** Un module requiert les specs que sa propre spec importe :
  `Camera` importe `Permissions` et `AppState`. `Linking`, `AppState`,
  `Appearance`, `BackgroundTasks`, `Splash`, `SystemUI` et `Window`
  définissent `always` : le shell lui-même les appelle (liens profonds, état
  de premier plan, changements de traits, lancements de tâches
  d'arrière-plan, écran de lancement, barres, taille et zone sûre de la
  fenêtre).
- **Les modules de l'application suivent la même règle.** Un module dans
  `modules/` que rien n'appelle n'est pas compilé. Deux modules du même nom,
  ou deux specs qui déclarent un type du même nom, font échouer le build en
  nommant les deux fichiers.

Les modules intégrés et ceux de l'application passent par ce chemin unique.
Les modules intégrés de Kuito vivent dans `native/modules/<name>/` (kebab
case, `native/modules/app-state`), organisés comme ceux d'une application.

| Généré (dans `.kuito/`)                                                      | À partir de                                                     |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `ios/Generated/KuitoLink.swift`                                              | les specs des modules inclus, et les ids que le bundle appelle  |
| `ios/project.json` : sources, `packages`, frameworks, Info.plist              | le `ios` des modules inclus                                     |
| `android/generated/dev/kuito/link/KuitoLink.kt`                             | les specs des modules inclus, et les ids que le bundle appelle  |
| `android/AndroidManifest.xml`, fusionné dans celui du framework               | les `permissions`, `providers` et `services` des modules inclus |
| `-Pkuito.sources`, `-Pkuito.dependencies` et `-Pkuito.moduleRes` de Gradle | le `android` des modules inclus                                 |

Les fichiers générés inchangés sont laissés tels quels, de sorte qu'une
reconstruction reste incrémentale, et un fichier généré qu'aucun module ne
produit plus est supprimé.

### Besoins natifs

Les clés `ios`, `android` et `always` d'une spec disent ce dont le module a
besoin en plus de ses fonctions. La CLI les valide avant de construire, et
les erreurs nomment la spec et la clé ; toute clé absente de la liste
ci-dessous est une erreur, de sorte qu'une faute de frappe ne passe pas en
silence.

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

| Clé                    | Signification                                                                                                                                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `always`               | `true` : dans chaque shell, appelé ou non. Pour les modules que le shell lui-même appelle.                                                                                                                                                                                                      |
| `ios.class`            | La classe Swift `final` conforme à la `<Name>Spec` générée, dans `ios/`.                                                                                                                                                                                                                        |
| `ios.frameworks`       | Frameworks système que la cible de l'application lie, comme `CoreHaptics`.                                                                                                                                                                                                                      |
| `ios.swiftPackages`    | Packages Swift : `url`, `from` (version minimale) et les `products` que la cible de l'application lie. Les shells iOS n'ont pas de CocoaPods.                                                                                                                                                   |
| `ios.infoPlist`        | Clés Info.plist, telles que les descriptions d'usage. Deux modules ne peuvent pas définir une même clé différemment, pas plus que l'`ios.infoPlist` de l'application ([paramètres natifs](apps.md#native-settings)) ; les motifs de `permissions` de l'application remplacent ceux d'un module. |
| `android.class`        | La classe Kotlin pleinement qualifiée implémentant la `<Name>Spec` générée, dans `android/`.                                                                                                                                                                                                    |
| `android.dependencies` | Coordonnées Gradle, `group:artifact:version`, ajoutées en `implementation`.                                                                                                                                                                                                                     |
| `android.permissions`  | Entrées `uses-permission` fusionnées dans le manifeste de l'application.                                                                                                                                                                                                                        |
| `android.features`     | Entrées `uses-feature` : `name`, et `required` (true sauf s'il indique `false`). Google Play masque une application aux appareils dépourvus d'une fonctionnalité requise, donc un module dont l'application fonctionne sans le matériel indique `false`.                                        |
| `android.providers`    | Des `<provider>` sous `<application>` : attributs sans `android:` (`name` et `authorities` requis ; `${applicationId}` fonctionne), et `resources`, des `<meta-data>` qui nomment une ressource que le module livre dans `android/res/`.                                                        |
| `android.services`     | Des `<service>` sous `<application>` : attributs sans `android:`, `name` requis, comme le `foregroundServiceType` d'un service de premier plan.                                                                                                                                                 |

Le répertoire `android/res/` d'un module, quand il en a un, rejoint les
ressources du shell, de sorte que les meta-data d'un provider peuvent nommer
un fichier XML qui s'y trouve. Préfixez les noms de ressources par celui du
module (`kuito_image_picker_paths`) : les ressources de tous les modules
inclus partagent un seul espace de noms.

Une spec doit déclarer `ios` ou `android`. Une section sans son dossier de
sources (`ios/` avec des fichiers `.swift`, `android/` avec des `.kt`), ou
des sources sans leur section, est aussi une erreur.

### Ajouter un module intégré

Un module livré avec Kuito est constitué des trois mêmes parties, dans
`native/modules/<name>/` : la spec `<name>.ts`, qui importe `defineModule`
depuis `src/native/define-module.ts`, et `ios/` et `android/`, avec le Kotlin
dans `dev.kuito.runtime.modules.<name>`. L'API applicative est un espace de
noms dans `src/native/<name>.ts` qui réexporte les membres de la spec un par
un, exporté depuis `src/native/index.ts`, de sorte qu'une application qui
n'en appelle aucun élimine le module. Ne définissez `always` que lorsque le
code propre du shell appelle les classes du module.

## Erreurs

<!-- error codes: generated from src/protocol/modules.ts -->

| Code                     | Signification                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `ERR_FUNCTION_NOT_FOUND` | La table de liaison du shell ne contient pas la fonction : reconstruisez-le.                      |
| `ERR_VIEW_NOT_FOUND`     | La vue d'une fonction de vue n'est pas montée.                                                    |
| `ERR_ARGUMENT`           | Un argument ne s'est pas décodé dans le type déclaré.                                             |
| `ERR_ENCODE`             | Un résultat ou le payload d'un événement n'est pas du JSON.                                       |
| `ERR_NATIVE`             | La fonction a levé autre chose qu'une `KuitoModuleError`.                                        |
| `ERR_THREAD`             | Un appel synchrone a atteint une fonction asynchrone.                                             |
| `ERR_NO_ACTIVITY`        | Le module a besoin de l'activité, et une tâche d'arrière-plan s'exécute sans. Android uniquement. |

<!-- end of generated error codes -->

Une fonction synchrone lève son erreur à l'appel. Une fonction asynchrone
rejette. Les arguments qui ne correspondent pas à la spec échouent dans le
noyau, avant que quoi que ce soit ne traverse, avec l'`ERR_ARGUMENT` de
l'hôte. Dans les deux cas, l'erreur est une `NativeModuleError` avec un
`code`, et son message nomme le module et la fonction
(`Clipboard.writeText failed: …`) : les noms propres du module natif, que
l'espace de noms enveloppe. Un écouteur d'événement qui lève une exception
est signalé à la LogBox, et les autres écouteurs s'exécutent quand même.

## Format de transport

Une fonction de module traverse la frontière de l'hôte par son id, de
`src/runtime/link.ts` via `native/shared/KuitoRuntime.cpp` jusqu'au linker
de chaque plateforme (`KuitoLinker`) et à son `KuitoLink` généré :

| Fonction hôte                              | Retourne                                                                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `__kuitoHostCall(id, ...args)`            | le résultat d'une fonction `js` ; un échec lève `__kuitoLinkError(id, code, message)`                                                 |
| `__kuitoHostCallAsync(id, call, ...args)` | rien ; l'hôte appelle plus tard `__kuitoLinkSettle(call, value)` ou `__kuitoLinkFail(call, code, message)`                           |
| `__kuitoHostObserve(id, observing)`       | rien ; pendant l'observation, l'hôte appelle `__kuitoLinkEmit(id, value)` pour un événement ou une valeur live                        |
| `__kuitoUIHostCall(id, ...args)`          | sur le thread UI, le résultat d'une fonction `main`, exécutée immédiatement ([appels depuis le thread UI](#calls-from-ui-thread-code)) |

Les valeurs traversent sous forme de valeurs JSI typées (native/shared/Link.h,
LinkJSI.h) : null, les booléens, les nombres et les chaînes tels quels, le
premier niveau d'un objet comme ses champs, et seules les données imbriquées
comme texte JSON. Les résultats reviennent de la même façon. Un échec est la
seule réponse avec un code et un message. Un hôte sans ces fonctions (l'hôte
`node:vm` des tests) n'a pas de modules natifs, de sorte qu'un module y
échoue à sa première utilisation avec un message qui le dit.

## L'API de module est versionnée

Les modules natifs sont le contrat public stable de Kuito : **API de
module 1**. Les modules d'une application, et plus tard les packages de
modules tiers, en dépendent, elle ne change donc que de façons qui laissent
les modules existants compiler et se comporter de la même manière. Le
contrat est :

- la spec : `defineModule`, `fn.sync`, `fn.main`, `fn.background` et leur
  `.callback`, `event`, `live` et `view`, les types qu'une spec peut utiliser
  et ses [besoins natifs](#native-needs) ;
- le protocole et l'interface `<Name>Spec` générés, et la façon dont chaque
  membre s'y projette ;
- `KuitoLinkedModule` (`init(context:)`, `destroy()`), `KuitoModuleContext`,
  `KuitoModuleError`, `KuitoPromise`, `KuitoEmitter`, `KuitoSignal`,
  `KuitoModuleView` avec `KuitoNativeView` et `KuitoViewEvents`, et
  `KuitoType` et `KuitoActivityResults` de Kotlin ;
- les codes d'erreur ci-dessus (`KuitoErrorCode` en Swift et en Kotlin).

Au sein de la version 1, les changements ne font qu'ajouter : une nouvelle
déclaration, un nouveau besoin natif, un nouveau code d'erreur. Un changement
qui casserait un module est livré en API 2, listé ici avec ce qu'il faut
changer. Tout le reste, les fonctions hôte du
[format de transport](#wire-format) et les ids de la table de liaison
compris, est interne et peut changer dans n'importe quelle release.
