# Native Module

Ein natives Modul ist Plattformcode, den eine App aufruft: eine Swift-Klasse
auf iOS, eine Kotlin-Klasse auf Android und eine TypeScript-Spezifikation, die
beide deklariert und für die App typisiert. Kuitos eigene Funktionalitäten
sind auf diese Weise gebaut und werden als kleingeschriebene Namespaces von
Funktionen und Signalen ausgeliefert: `haptics`, `clipboard`,
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
[`alert()` und `prompt()`](alert.md), [`actionSheet()`](action-sheet.md) und [`audio`](audio.md).
Ein Modul kann auch eine View beisteuern, die eine App in JSX rendert
([Views](#views)), wie es [`Camera`](camera.md),
[`WebView`](webview.md) und [`Video`](video.md) tun. Ein Modul, das eine
Laufzeitberechtigung benötigt, fragt nativ über `KuitoPermissions` an; siehe
[Berechtigungen](permissions.md#from-another-module).

```tsx
import { Text, clipboard, haptics } from 'kuito';

console.log(await clipboard.readText());
await clipboard.writeText('https://www.tvmaze.com');
void haptics.selection();

<Text>{clipboard.hasText.value ? 'Paste' : 'Nothing to paste'}</Text>;
```

Jede Funktionalität ist ein Namespace des Root-Einstiegspunkts, eine Datei,
die ihre Funktionen einzeln exportiert, sodass ein Bundle nur die Funktionen
behält, die es aufruft.

## Die Spezifikation eines Moduls

Ein Modul wird einmal deklariert, in TypeScript, und per Id verknüpft: Der
Compiler liest die Spezifikation, ohne sie auszuführen, das Bundle behält
einen Stub für jede Funktion, die die App aufruft, und die Shell kompiliert
eine Link-Tabelle, die nur diese enthält. Nichts wird per Name dispatcht.

`modules/battery/battery.ts`, die Spezifikation, benannt wie ihr Verzeichnis:

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

| Deklaration             | Läuft auf                                   | JavaScript erhält | Nativ                                        |
| ----------------------- | ------------------------------------------- | ----------------- | -------------------------------------------- |
| `fn.sync`               | dem JS-Thread                               | den Wert          | gibt den Wert zurück                         |
| `fn.main`               | dem Main-Thread (UI)                        | ein Promise       | gibt den Wert zurück, `@MainActor`           |
| `fn.background`         | dem seriellen Hintergrund-Thread des Moduls | ein Promise       | gibt den Wert zurück                         |
| `fn.main.callback`, ... | startet auf seinem Thread                   | ein Promise       | schließt ein `KuitoPromise` später einmal ab |

Neben Funktionen deklariert eine Spezifikation, was die Plattform sendet:

- **`event<Payload>()`**, ein Ereignis: `low.addListener(fn)` gibt ein
  Abonnement zurück. Die Plattform sendet es vom ersten Listener an, bis der
  letzte entfernt wird: Nativ laufen `startLow(_ emitter: KuitoEmitter<LowBattery>)`
  und `stopLow()` auf dem Main-Thread, und `emitter.send(payload)` darf
  dazwischen von jedem Thread aus aufgerufen werden. `event()` ohne Typ hat
  keine Payload.
- **`live<T>()`**, Plattformzustand, den eine App als Signal liest
  (`battery.charging.value`). Unbeobachtet ruft jeder Lesezugriff `charging()`
  auf dem JS-Thread auf, sodass er nie veraltet ist; solange etwas ihn
  verfolgt, läuft `startCharging(_ signal: KuitoSignal<Bool>)` auf dem
  Main-Thread, und `signal.set(value)` schreibt das Signal durch den Kernel.
  `live`, nicht `signal`: `signal()` erzeugt ein app-eigenes.
- **`view<Props, Methods>({ events, methods })`**, eine View, die die App in
  JSX rendert ([Views](#views)).

### Was eine Spezifikation enthalten darf

Der Compiler liest die Spezifikation so, wie sie geschrieben ist
(src/dev/modules/spec.ts), daher enthält sie nur Imports, Typen und ihren
Default-Export, `defineModule`, wobei jeder Wert ein Literal ist. Eine
Anweisung, die ausgeführt würde, ist ein Build-Fehler an ihrer Zeile, ebenso
wie alles im Folgenden, was die Plattformen nicht gemeinsam haben können.

- **Der Name** ist ein PascalCase-String-Literal: `Battery` ist, was Swift und
  Kotlin als `BatterySpec` implementieren.
- **Parameter und Ergebnisse** sind `number`, `string`, `boolean`, `Json`,
  Arrays, `Record<string, T>`, `T | null`, optionale Parameter und Felder sowie
  benannte Typen. Eine mit `type` deklarierte String-Union wird zu einem Enum
  (`Mode`: Swifts `.saver`, Kotlins `Mode.SAVER`), und ein mit `type` oder
  `interface` deklarierter Objekttyp zu einem Struct oder einer Data Class.
  Eine Inline-Union oder ein Inline-Objekt ist ein Fehler, der den Alias
  vorschlägt; ein Generic, `extends`, ein Funktionstyp oder ein Typ, der sich
  selbst enthält, ist ebenfalls ein Fehler.
- **Member-Namen** sind Swift- und Kotlin-Bezeichner, jeder einmal deklariert.
  `then` und `default` sind reserviert, ebenso `always`, `ios` und `android`,
  die die [nativen Anforderungen](#native-needs) des Moduls enthalten.
- **Die Methode einer View** läuft auf dem Main-Thread mit der View, daher ist
  sie `fn.main`, und sie darf nicht den Namen eines Members des View-Elements
  tragen (`id`, `focus`, `addEventListener`, ...).
- **Ein Import einer anderen Spezifikation** ist ein Modul, das dieses nativ
  benötigt (`import '../permissions/permissions'`): Die Shell schließt es
  ebenfalls ein.

Eine App importiert den Default-Export der Spezifikation, das Modul, und ruft
dessen Member auf: `import Battery from './modules/battery/battery'` und
`Battery.read()`. Seine Typen sind die der Spezifikation; das Bundle behält
dennoch nur die aufgerufenen Member. Kuitos eigene Funktionalitäten
re-exportieren ihre aus ihrem Namespace (`haptics.impact`,
`clipboard.hasText`).

### Was der Compiler generiert

- **Ein Stub pro Member**, anstelle der Spezifikation: `const read =
  /* @__PURE__ */ globalThis.__kuito.link(3, "Battery.read", "js", [])`, seine
  Id, sein Thread und sein Argumentschema (src/dev/modules/stubs.ts).
  Ereignisse, Live-Werte und Views haben ihre eigenen (`linkEvent`,
  `linkLive`, `linkView`). Die Ids nummerieren jeden Member jedes Moduls, das
  die App aufrufen kann, nach Modulname, dann Deklarationsreihenfolge, eine
  View und dann jede ihrer Methoden (src/dev/modules/catalog.ts). Jeder Stub
  ist pure, sodass der Bundler jeden fallen lässt, den die App nicht aufruft;
  die nach der Dead-Code-Eliminierung noch im Bundle verbliebenen Ids sind die
  Link-Tabelle der Shell (src/dev/modules/plugin.ts).
- **Ein Swift-Protokoll und ein Kotlin-Interface pro Modul**, `BatterySpec:
  KuitoLinkedModule`, mit den Enums und Structs der Spezifikation
  (src/cli/link-swift.ts, link-kotlin.ts). Die Klasse, die `ios.class` und
  `android.class` benennen, konformiert dazu; eine Klasse, die von ihrer
  Spezifikation abgewichen ist, lässt den nativen Build fehlschlagen und nennt
  die Methode:

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

  Die Kotlin-Typen liegen in `dev.kuito.link` (`import dev.kuito.link.BatterySpec`).
  Zahlen sind `Double`, `Json` ist `Any` in Swift und `Any?` in Kotlin, und
  ein optionales Feld ist ein Swift-Optional oder ein Kotlin-Nullable mit
  Standardwert null.

- **`destroy()`**, das die Klasse eines Moduls implementieren kann, läuft auf
  dem Main-Thread, wenn die Runtime herunterfährt (ein Reload oder das
  Schließen der App), nachdem ihre Observer gestoppt wurden: Dort wird
  zurückgegeben, was das Modul außerhalb der Runtime hält, so wie `keepAwake`
  den Idle-Timer zurückgibt.
- **Die Link-Tabelle**, `ios/Generated/KuitoLink.swift` und
  `android/generated/dev/kuito/link/KuitoLink.kt` in `.kuito/`:
  `KuitoLink.function(id)` enthält eine `KuitoFunction(name, thread:, arity:,
  run:)` pro Funktions-Id, die das Bundle aufruft; sie dekodiert die Argumente
  in die Typen der Spezifikation, ruft das Modul auf und kodiert sein
  Ergebnis, und `KuitoLink.observer(id)` einen Eintrag pro Ereignis und
  Live-Wert, das bzw. den es beobachtet. Die Instanz eines Moduls wird mit
  `init(context:)` beim ersten Aufruf erzeugt. Eine generierte Datei, die ein
  Build nicht mehr schreibt, wird gelöscht.

Ein Live Patch, der eine Funktion aufruft, die die laufende Shell nicht
verknüpft hat, oder eine Spezifikationsänderung, die sie neu nummeriert, baut
die Shell neu.

### Was ein Release ausliefert

Tree Shaking arbeitet auf der Ebene von Funktionen. Das Bundle enthält nur für
jeden Member, den die App aufruft, einen Stub; ein Modul, von dem kein Member
aufgerufen wird, wird gar nicht in die Shell kompiliert, es sei denn, es ist
[immer aktiv oder erforderlich](#which-modules-a-shell-includes). Von einem
Modul, das es ist, behalten Release-Builds nur, was die Link-Tabelle erreicht.
Auf Android verkleinert R8 die App, und `native/android/app/proguard-rules.pro`
behält über die JNI-Einstiegspunkte hinaus nichts per Name, sodass eine
Funktion, die kein Eintrag aufruft, entfernt wird. Auf iOS optimiert ein
Release-Build das gesamte Modul und linkt mit `-dead_strip`: Die Link-Tabelle
erreicht ein Modul nur über das Protokoll seiner Spezifikation, sodass der
Witness einer Anforderung, die kein Eintrag aufruft, und die Methode dahinter
verworfen werden. Nichts hier ist `@objc` oder für Subclassing offen, was sie
am Leben halten würde. Ein Debug-Build behält alles.

## Views

Ein Modul kann eine View beisteuern: eine `UIView` auf iOS und eine
Android-`View`, in JSX gerendert wie jedes Primitiv. Sie nimmt Style- und
Layout-Props an, die gemeinsame Flexbox-Engine positioniert sie, und ihre
Ereignisse kommen als `on*`-Props an. Nichts in den Renderern ändert sich, um
eine hinzuzufügen. `Slider` wird mit Kuito ausgeliefert und ist auf diese
Weise gebaut.

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

### Wie Views funktionieren

- **Eine View ist ein Member der Spezifikation ihres Moduls.** `view: view<SliderProps>({
  events: ['change', 'changeEnd'] })` deklariert sie, und die App rendert die
  `view` des Moduls (`Slider` ist `SliderModule.view`). Ein Modul hat
  höchstens eine View und kann daneben Funktionen und Ereignisse haben.
- **Sie registriert sich beim ersten Rendern.** Das Importieren der View
  überquert nichts. Wenn der Kernel zum ersten Mal eine plant, ruft er die
  eigene Id der View auf, und die Plattform registriert die Art
  (`module:Slider`) beim Renderer, mit den Ereignissen, die die Spezifikation
  deklariert.
- **Ihre Props sind eine Tabelle, die nach Prop-Namen indiziert ist,** wie die
  eigenen `properties/`-Tabellen des Renderers. Die Props der View kommen
  zuerst, dann die gemeinsamen Tabellen (Layout, Dekoration, Barrierefreiheit,
  Gesten ...), sodass `width`, `margin`, `opacity` oder `label` unverändert
  darauf funktionieren. Eine Prop, die die View nicht deklariert und die keine
  gemeinsame Tabelle besitzt, wirft `unsupportedProp`, und ein Wert, der nicht
  in den deklarierten Typ dekodiert, `unsupportedValue`
  ([nativer Renderer](native-renderer.md#errors)).
- **Ihre `on*`-Props sind die Ereignisse, die sie deklariert.** `onChangeEnd`
  hört auf `changeEnd`. Der Handler erhält das Ereignis (`type`, `target`) mit
  den Feldern der Payload darauf, außer `onChange`, das den `value` der
  Payload erhält, wie es die eines TextField und eines Toggle tun. Eine an
  ein Signal gebundene Prop ist bidirektional: Ein Ereignis, dessen Payload
  ein Feld mit dem Namen der Prop hat, schreibt sie. Eine `on*`-Prop für ein
  Ereignis, das die View nicht deklariert, ist ein Fehler, der die
  deklarierten auflistet. Die `gestures`-Prop hängt weiterhin Gesten an;
  andere Ereignis-Props (`onPress`, ...) bedeuten auf der View eines Moduls
  nichts, es sei denn, sie deklariert dieses Ereignis. Ereignisse reisen über
  das [Ereignis-Wire-Format](events.md#wire-format).
- **Ihre Methoden sind Methoden ihrer Ref.** Was Props nicht ausdrücken
  können (ein Bild aufnehmen, in einem Video springen, eine Seite neu laden),
  deklariert eine View als `methods`. Ihr Element, der Wert, den ihre `ref`
  hält, beantwortet sie neben `id` und `addEventListener`; jede gibt ein
  Promise zurück und läuft auf dem Main-Thread mit dieser View. Ein Aufruf auf
  einer View, die nicht mehr gemountet ist, wird abgelehnt, ohne die Grenze zu
  überqueren.
- **Sie ist ein Blatt, dimensioniert durch ihren Style.** Die Layout-Engine
  kann eine Kamera oder eine Web-View nicht nach einer Inhaltsgröße fragen,
  daher hat die View eines Moduls keine intrinsische Größe und schrumpft nie
  unter ihren Style, wie ein Control. Sie braucht eine `height` (und eine
  `width`, oder `alignItems: stretch` und `flex` dimensionieren sie). Sie
  nimmt keine Kinder an.

### Eine View schreiben

Das Beispiel ist das `Slider`-Modul, `native/modules/slider/` (in einer App
`modules/<name>/`).

**1. Deklarieren.** Die Props sind ein eigener Typ, neben der Spezifikation:

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

Props sind JSON-Daten; `on*`-Props sind Handler. Die Komponente akzeptiert jede
Prop als Wert oder als Signal, neben den Style-, Layout- und
Barrierefreiheits-Props jeder View.

Eine View mit Methoden typisiert sie in einem zweiten Typargument und
deklariert jede in `methods`, als `fn.main`. Eine Ref vom Handle-Typ der View
ruft sie auf (`native/modules/webview/webview.ts`):

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

**2. Die Swift-View schreiben.** Der `view`-Member der Spezifikation ist eine
Funktion, die eine `KuitoModuleView` zurückgibt: die Klasse der View und ihre
Props.

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

- Die View konformiert zu `KuitoNativeView`: Kuito ruft `init(events:)` auf
  dem Main-Thread für jedes gerenderte Element auf.
- Der Wert einer Prop dekodiert in jedes `Decodable`. Er sollte optional sein,
  um das Entfernen der Prop zu akzeptieren, das als null ankommt; eine nicht
  optionale Prop lehnt es ab.
- `events.emit` nimmt keine Payload oder ein `Encodable`, das zu einem
  JSON-Objekt kodiert. Ein Ereignis auszulösen, das die Spezifikation nicht
  deklariert, ist ein Programmierfehler und führt zu einem Trap. Eine
  optionale Payload-Eigenschaft wird mit `@KuitoNullable` markiert, um
  `null` zu senden, statt sie wegzulassen, wie es eine als `T | null`
  typisierte Payload erwartet.
- Jede Methode ist eine Anforderung des Protokolls, aufgerufen auf dem
  Main-Thread mit der gemounteten View als erstem Argument; sie wird in die
  Klasse der View gecastet
  (`native/modules/webview/ios/KuitoWebViewModule.swift`):

  ```swift
  @MainActor func reload(_ view: UIView) throws {
      guard let web = view as? KuitoWebView else {
          throw KuitoModuleError(KuitoErrorCode.viewNotFound, "The view is not a WebView")
      }
      web.reload()
  }
  ```

**3. Die Kotlin-View schreiben.**

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

- `KuitoModuleView` nimmt den Konstruktor der View, `(Context,
  KuitoViewEvents)`, der auf dem UI-Thread für jedes gerenderte Element
  läuft.
- Jede Prop benennt ihren `KuitoType` (`string`, `boolean`, `int`, `double`,
  `obj`, `array`, `list(…)`, `optional(…)`, `enum(…)`); ein Wert des falschen Typs wirft
  `unsupportedValue`. `KuitoType.optional` akzeptiert das Entfernen.
- `events.emit(event, payload)` nimmt eine `Map` von JSON-Daten oder keine
  Payload.
- Jede Methode überschreibt die des Interfaces, auf dem UI-Thread mit der
  gemounteten View als erstem Argument: `override fun reload(view: android.view.View) = web(view).reload()`.

**4. Freigeben, was eine View hält.** Eine View, die etwas außerhalb ihrer
selbst hält (einen Player, eine Kamera-Session), gibt es in `unmount` zurück.
Kuito ruft es auf dem Main-Thread auf, wenn es die View entfernt, und für
jede Modul-View, wenn die Runtime neu lädt. Die View kann für eine
Exit-Animation einen Moment länger auf dem Bildschirm bleiben und wird danach
nicht wiederverwendet.

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

Auf iOS ist `unmount` Teil von `KuitoNativeView` und tut nichts, solange die
View es nicht implementiert; auf Android implementiert eine View
`KuitoNativeView` nur, um es zu empfangen. Das Verlassen des Fensters ist
kein Unmounting: Eine View unter einem gepushten Screen oder hinter einer
Vollbild-Präsentation ist weiterhin gemountet.

**5. Die JavaScript-Seite testen.** `test/native-views.test.ts` rendert die
View eines Moduls gegen eine Fake-Plattform, prüft dann die Props, die der
Host erhält, und sendet Ereignisse zurück.

### Eine View über die Leitung

Die View eines Moduls überquert die Host-Grenze als die Art `module:<Name>`
(`module:Slider`), getrennt von den eingebauten Arten. Ihre eigene Id
registriert die Art: Die Link-Tabelle übergibt `KuitoModuleViews` die
`KuitoModuleView` mit den Ereignissen der Spezifikation. Eine Methode ist
eine verknüpfte Main-Thread-Funktion, deren erstes Argument die Nummer der
View ist: Die Plattform findet die gemountete View in `KuitoModuleViews`, das
jede Modul-View von ihrer Erzeugung bis zu ihrer Entfernung durch den Renderer
hält, und schlägt mit `ERR_VIEW_NOT_FOUND` fehl, wenn sie weg ist. Props
reisen wie die jeder View: Strings als solche, Zahlen und Booleans als
Skalare, Objekte und Arrays als JSON-Text; die Plattform dekodiert jede in den
Typ, den die Prop deklariert. Jeder Renderer erreicht Modul-Arten über eine
einzige Nahtstelle: `KuitoViewFactory` erzeugt eingebaute Arten aus seiner
Tabelle und Modul-Arten aus `KuitoModuleViews`, und die eigenen Props einer
View liegen auf ihrem `KuitoViewStyle`, vor `KuitoProperties`.

## Aufrufe aus UI-Thread-Code

App-Code benennt nie einen Thread ([Motion](motion.md)): Ein Gesten- oder
Scroll-Handler, den der Compiler auf den UI-Thread legt, ruft ein Modul wie
jeder andere Code auf. Eine `fn.main`-Funktion, die ihr Ergebnis zurückgibt
(keine `callback`-Funktion), läuft dort direkt, über `__kuitoUIHostCall`: Der
UI-Thread ist der Main-Thread, daher ruft die Plattform das Modul sofort auf,
ohne Sprung zum JS-Thread und zurück, und der Aufruf antwortet mit einem
Promise, wie er es auf dem JS-Thread tut. `haptics.impact('light')` in einem
Scroll-Handler spielt in dem Frame ab, der den Schwellenwert überschritten hat
(`test/motion-app.test.ts`). Jede andere Funktion, die UI-Thread-Code aufruft,
wird ohne Warten an den JS-Thread gesendet, und die Verwendung ihres
Ergebnisses auf dem UI-Thread ist ein Fehler, der die Funktion benennt.

## Werte, Signale und Aktionen

Die Member einer Funktionalität folgen einer Regel, sodass ein Leser jeden an
seinem Namen erkennt:

- **Eine Aktion ist ein Verb**: `haptics.impact('light')`, `linking.open(url)`,
  `app.openSettings()`. Eine, die auf die Plattform wartet, gibt ein Promise
  zurück. Es gibt kein `Async`-Suffix.
- **Ein fester Fakt ist eine Eigenschaft**: `device.model`, `haptics.supported`,
  `fileSystem.documents`. Er wird einmal gelesen, beim Start der App; eine
  App, die keinen der Fakten einer Funktionalität liest, fragt nie an.
- **Ein Wert, der sich ändert, ist ein Signal**: `appearance.colorScheme`,
  `network.state`, `app.state`, `clipboard.hasText`. `.value` wird synchron
  gelesen. Eine Komponente folgt ihm so, wie sie ihrem eigenen Zustand folgt:
  ein Lesezugriff in JSX oder `watch(appearance.colorScheme, fn)`. Es gibt
  keine Getter, Setter oder Listener, die dazugehören, und `watch` ist die
  einzige Möglichkeit, einem zu folgen.
- **Ein beschreibbares Signal** (`brightness.level`, `splash.variant`) nimmt
  eine Zuweisung an. Es zeigt den neuen Wert sofort, und ein Schreibzugriff,
  den die Plattform ablehnt, geht über die Fehler-Nahtstelle.
- **Ein Ereignis ist `watch(event, fn)`** auf dem Namespace, wenn es kein Wert
  ist: `app.watch('memoryWarning', fn)`.

### Nur beobachtet, solange verfolgt

Ein Systemzustands-Signal beginnt, die Plattform zu beobachten, wenn die erste
Komponente es abonniert, und hört auf, wenn die letzte das Abonnement beendet:
Das native Modulereignis dahinter wird mit ihm gestartet und gestoppt.
Unverfolgt fragt ein Lesezugriff die Plattform synchron ab, sodass er nie
veraltet ist. Der Beginn der Beobachtung meldet den Zustand, von dem die
Plattform ausgeht, was eine zwischenzeitliche Änderung erfasst. Ein Binding,
das seine Lesezugriffe neu verfolgt, hält die Plattform währenddessen
beobachtet.

Das Primitiv des Kernels ist `__kuito.createSource(read, observe)`
(`src/runtime/signals.ts`); `source()` in `src/native/scope.ts` kapselt es,
sodass die Signale eines Moduls bis zum ersten Lesezugriff nichts kosten.

### Scope-Effekte

Eine Ressource, die ihren Nutzer nicht überleben soll (`keepAwake()`, ein
Audio-Player), gehört der Komponente, die sie erzeugt:

```tsx
function Reader() {
  keepAwake(); // held from mount until Reader unmounts
  return <Article />;
}

const release = keepAwake({ scope: app }); // the app's, for its life
```

Während des Aufbaus einer Komponente aufgerufen, wird die Ressource einmal für
diesen Aufruf erzeugt (ein erneutes Rendern oder ein Live Patch behält sie),
beim Mounten der Komponente gestartet und freigegeben, wenn die Komponente
unmountet wird oder der Aufruf verschwindet. Überall sonst benötigt der Aufruf
`{ scope: app }`: Der Compiler meldet einen mit Datei und Zeile
(`src/dev/scope-effects.ts`), auf Modulebene, in einem Helfer oder in einem
Handler, und der Kernel wirft für jeden, den er nicht sehen konnte, und
benennt die Korrektur. Die Zustands-Ref einer View (`videoRef()`,
`cameraRef()`, `webViewRef()`) hat keinen App-Scope: Wie `ref()` kann nur
eine Komponente sie besitzen. Nichts ist
`use*`, und nichts benötigt ein manuelles `release()`.

Das Primitiv des Kernels ist `__kuito.own(label, create, start)`
(`src/runtime/api.ts`): Ein Hook-Slot hält, was `create` erzeugt hat, und der
Mount-Eintrag, den `start` zurückgibt, gibt es frei.

## Wie es funktioniert

- **Jede Funktion sagt, wo sie läuft.** Eine `fn.sync`-Funktion läuft auf dem
  JS-Thread und gibt ihren Wert direkt zurück; `fn.main` und `fn.background`
  laufen auf dem Main-Thread oder auf dem eigenen seriellen Hintergrund-Thread
  des Moduls, in Aufrufreihenfolge, und JavaScript erhält ein Promise.
  Standardmäßig wird nichts gebridgt.
- **Module laden beim ersten Aufruf.** Das Importieren eines Moduls überquert
  nichts. Die Plattform erzeugt die Instanz des Moduls, wenn zum ersten Mal
  eine seiner Funktionen läuft oder eines seiner Ereignisse oder einer seiner
  Live-Werte beobachtet wird, sodass der Start nie für ein Modul zahlt, das
  die App noch nicht aufruft.
- **Argumente werden geprüft, bevor sie die Grenze überqueren.** Der Kernel
  prüft jedes Argument gegen das Schema der Funktion (src/runtime/link.ts) und
  schlägt mit `ERR_ARGUMENT` fehl, wobei er die Funktion, das Argument und das
  Feld benennt: Eine Funktion, `NaN`, ein `Date` oder eine Klasseninstanz
  erreicht den Host nie. Die Plattform dekodiert, was die Grenze überquert, in
  die Typen der Spezifikation, sodass eine Abweichung dort mit demselben Code
  fehlschlägt, statt gecastet zu werden.
- **Eine Shell hat nur, was die App aufruft.** Die CLI findet Kuitos
  eingebaute Module und die eigenen `modules/` der App, schließt die Module
  ein, die das Bundle aufruft, und generiert die Link-Tabelle. Niemand
  bearbeitet eine Registry, den Renderer oder die Shell. Siehe [welche Module
  eine Shell einschließt](#which-modules-a-shell-includes).

`KuitoThread`, das eine Thread-Enum (`js`, `main`, `background`), wird mit
dem Rest des Host-Vertrags aus `src/protocol/modules.ts` generiert.

Ein asynchroner Aufruf beginnt, nachdem der JS-Task, der ihn gemacht hat,
endet, sodass die View-Änderungen, die dieser Task gemacht hat, den
Main-Thread zuerst erreichen: Eine Main-Thread-Funktion sieht sie für den
nächsten Frame eingereiht, worauf sich `splash.hide` verlässt
([Splash-Screen](splash.md#until-the-app-is-ready)).

Synchrone Funktionen sollten schnell und thread-sicher sein. Sie blockieren
JavaScript, während sie laufen, und dürfen UIKit oder Android Views nicht
anfassen. Sie eignen sich für günstige Lesezugriffe wie `clipboard.hasText`
oder `haptics.supported`.

## Ein eigenes Modul schreiben

Die Module einer App liegen in ihrem `modules/`-Ordner, neben `app/`, und nie
in Kuitos eigenen Dateien. Mit der CLI wird eines erstellt:

```bash
kuito module create Battery
```

```text
modules/battery/
  battery.ts                the spec
  ios/BatteryModule.swift
  android/BatteryModule.kt
```

Das Verzeichnis ist der Name in Kebab-Case (`BatteryLevel` in
`modules/battery-level/battery-level.ts`), und die Spezifikation ist wie es
benannt: Ein Verzeichnis unter `modules/` ohne seine Spezifikation lässt den
Build fehlschlagen. Das Gerüst ist ein funktionierendes Modul mit einer
synchronen Funktion, einer Main-Thread-Funktion und einem Ereignis. Es wird
aus der App importiert, dann `kuito dev` ausgeführt. Der Rest dieses
Abschnitts macht daraus ein `Battery`-Modul mit einem Live-Wert und einem
Main-Thread-Lesezugriff.

### 1. Die Spezifikation deklarieren

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

### 2. Das Swift-Modul schreiben

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

- Die Klasse ist `final` und konformiert zum generierten `BatterySpec`; der
  Build schlägt fehl und benennt die Anforderung, bis sie jeden Member
  implementiert. Die Typen der Spezifikation (`Reading`) werden daneben
  generiert.
- `KuitoModuleError("ERR_BUSY", "…")` wird geworfen, um mit einem eigenen
  Code fehlzuschlagen. Jeder andere Fehler kommt als `ERR_NATIVE` mit seiner
  Beschreibung an.
- Für eine Callback-API (eine Berechtigungsabfrage, eine Kameraaufnahme) wird
  die Funktion als `fn.main.callback` deklariert und das `KuitoPromise`
  einmal abgeschlossen, von jedem Thread aus, mit `resolve(value)` oder
  `reject(code, message)`:

  ```swift
  @MainActor func requestAccess(_ promise: KuitoPromise<Bool>) {
      AVCaptureDevice.requestAccess(for: .video) { granted in promise.resolve(granted) }
  }
  ```

- `start<Name>` und `stop<Name>` laufen auf dem Main-Thread: `start`, wenn der
  erste Listener oder Beobachter ankommt, `stop`, wenn der letzte geht oder
  die Runtime herunterfährt. Der Emitter oder das Signal darf dazwischen von
  jedem Thread aus verwendet werden.
- Zustand, den der Lebenszyklus der App besitzt, kommt von der Shell über ein
  gemeinsames Objekt, das das Modul beobachtet, wie `KuitoLinks` für
  eingehende Links und `KuitoAppLifecycle` für den Vordergrundzustand
  ([AppState](app-state.md#how-it-is-wired)). Die Shell ruft die Klassen eines
  solchen Moduls auf, daher setzt seine Spezifikation `always: true`.
- Die Dateien in `ios/` werden in das Target der App kompiliert, neben Kuitos
  eigenen und der generierten Link-Tabelle, sodass die Modul-API keinen Import
  benötigt.

### 3. Das Kotlin-Modul schreiben

`modules/battery/android/BatteryModule.kt`, in einem Paket unter der
`applicationId` der App (`kuito module create` wählt es):

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

- Die Klasse nimmt den `KuitoModuleContext` und implementiert das generierte
  `BatterySpec`; die Typen der Spezifikation liegen in `dev.kuito.link` und
  die der Runtime (`KuitoPromise`, `KuitoEmitter`, `KuitoSignal`,
  `KuitoModuleView`) in `dev.kuito.runtime.link`.
- `KuitoModuleError("ERR_BUSY", "…")`, `fn.main.callback`, `destroy()` und
  das Threading von `start` und `stop` funktionieren genauso wie auf iOS.
- `context.activity` ist die Host-Activity. Die Runtime eines
  [Hintergrund-Tasks](background-tasks.md) hat keine, und ein Lesezugriff
  darauf schlägt dort mit `ERR_NO_ACTIVITY` fehl: `context.applicationContext`
  dient für alles, was nur einen `Context` benötigt (Systemdienste, Dateien,
  Datenbanken).
- Um eine andere Activity für ihr Ergebnis zu starten (einen System-Picker,
  die Kamera), wird
  `KuitoActivityResults.launch(context.activity, contract, input) { output -> … }`
  auf dem Main-Thread aufgerufen, mit einem beliebigen
  `ActivityResultContract`. Es registriert einen einmaligen Callback bei der
  Ergebnis-Registry der Activity, sodass kein Modul `onActivityResult`
  überschreibt. Berechtigungsabfragen gehen ebenfalls darüber.

Für ein Modul, das nur auf einer Plattform ausgeliefert wird, entfallen der
Abschnitt der anderen Plattform in der Spezifikation und ihr Ordner; eine auf
der anderen aufgerufene Funktion schlägt mit `ERR_FUNCTION_NOT_FOUND` fehl.
Die Dokumentation des Moduls sollte angeben, welcher Plattform es fehlt.

### 4. Verwenden

```tsx
import Battery from './modules/battery/battery';

const reading = await Battery.read();

<Text>{Battery.lowPower.value ? 'Low Power Mode' : `${Math.round(reading.level * 100)}%`}</Text>;
```

`kuito dev` baut das Modul in die Shell der App. Während es läuft, baut das
Speichern einer `.swift`-, `.kt`- oder `.ts`-Datei unter `modules/` die Shell
neu (inkrementell: Xcode und Gradle kompilieren neu, was sich geändert hat)
und startet die App neu. Ein Live Patch, der eine Funktion aufruft, die die
laufende Shell nicht verknüpft hat, etwa ein erstes `Battery.read()`, baut die
Shell ebenfalls neu; jede andere TypeScript-Änderung bleibt ein Live Patch.

### 5. Die JavaScript-Seite testen

Die Hälfte des Kernels läuft in Node. `test/support/fake-modules.ts`
beantwortet die Host-Funktionen der Link-Tabelle mit einer Fake-Plattform,
sodass auf einem Modul aufbauende App-Logik ohne Gerät getestet wird:
`fakeModules({ Camera: { functions: {
takePicture: { thread: 'main', run: () => picture } } } })`, sein `host` in den
von `installKernel` gespreadet, und `attach(kernel)`, sobald der Kernel
installiert ist (`test/camera.test.ts`). Es nummeriert Kuitos eingebaute
Spezifikationen so wie der Compiler. `test/module-calls.test.ts` zeigt die
Kernel-Seite eines Aufrufs per Id.

## Welche Module eine Shell einschließt

Eine App zahlt nur für die Module, die sie verwendet: Eine, die nie ein
`Video` rendert, liefert nie dessen Swift, Kotlin oder native Abhängigkeiten
aus. Die CLI entscheidet beim Bauen der Shell (`shellModules`,
src/cli/modules.ts):

- **Das Bundle benennt, was es aufruft.** Jeder Stub, der nach dem Tree
  Shaking im Bundle der App verbleibt, benennt ein Modul. `haptics` aus
  `kuito` zu importieren und `haptics.impact` aufzurufen behält diesen einen
  Stub und lässt den von `clipboard` fallen.
- **Die Shell schließt diese Module ein, was sie benötigen, und die immer
  aktiven.** Ein Modul benötigt die Spezifikationen, die seine eigene
  Spezifikation importiert: `Camera` importiert `Permissions` und `AppState`.
  `Linking`, `AppState`, `Appearance`, `BackgroundTasks`, `Splash`, `SystemUI`
  und `Window` setzen `always`: Die Shell selbst ruft sie auf (Deep Links, der
  Vordergrundzustand, Trait-Änderungen, Starts von Hintergrund-Tasks, der
  Launch-Screen, die Leisten, die Größe und der sichere Bereich des Fensters).
- **App-Module folgen derselben Regel.** Ein Modul in `modules/`, das nichts
  aufruft, wird nicht kompiliert. Zwei Module mit einem Namen oder zwei
  Spezifikationen, die einen Typ mit einem Namen deklarieren, lassen den Build
  fehlschlagen und benennen beide Dateien.

Eingebaute und App-Module gehen durch diesen einen Pfad. Kuitos eingebaute
Module liegen in `native/modules/<name>/` (Kebab-Case,
`native/modules/app-state`), aufgebaut wie die einer App.

| Generiert (in `.kuito/`)                                                  | Aus                                                                                 |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `ios/Generated/KuitoLink.swift`                                           | den Spezifikationen der eingeschlossenen Module und den Ids, die das Bundle aufruft |
| `ios/project.json`: Quellen, `packages`, Frameworks, Info.plist           | dem `ios` der eingeschlossenen Module                                               |
| `android/generated/dev/kuito/link/KuitoLink.kt`                           | den Spezifikationen der eingeschlossenen Module und den Ids, die das Bundle aufruft |
| `android/AndroidManifest.xml`, in das des Frameworks gemergt              | den `permissions`, `providers` und `services` der eingeschlossenen Module           |
| Gradles `-Pkuito.sources`, `-Pkuito.dependencies` und `-Pkuito.moduleRes` | dem `android` der eingeschlossenen Module                                           |

Unveränderte generierte Dateien werden nicht angefasst, sodass ein Rebuild
inkrementell bleibt, und eine generierte Datei, die kein Modul mehr erzeugt,
wird gelöscht.

### Native Anforderungen

`ios`, `android` und `always` einer Spezifikation sagen, was das Modul neben
seinen Funktionen benötigt. Die CLI validiert sie vor dem Bauen, und Fehler
benennen die Spezifikation und den Schlüssel; jeder Schlüssel, der nicht unten
steht, ist ein Fehler, sodass ein Tippfehler nicht stillschweigend durchgeht.

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

| Schlüssel              | Bedeutung                                                                                                                                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `always`               | `true`: in jeder Shell, aufgerufen oder nicht. Für Module, die die Shell selbst aufruft.                                                                                                                                                                                                      |
| `ios.class`            | Die `final` Swift-Klasse, die zum generierten `<Name>Spec` konformiert, in `ios/`.                                                                                                                                                                                                            |
| `ios.frameworks`       | System-Frameworks, die das App-Target linkt, wie `CoreHaptics`.                                                                                                                                                                                                                               |
| `ios.swiftPackages`    | Swift-Pakete: `url`, `from` (Mindestversion) und die `products`, die das App-Target linkt. iOS-Shells haben keine CocoaPods.                                                                                                                                                                  |
| `ios.infoPlist`        | Info.plist-Schlüssel, etwa Nutzungsbeschreibungen. Zwei Module dürfen einen Schlüssel nicht unterschiedlich setzen, und ebenso wenig darf es das `ios.infoPlist` der App ([native Einstellungen](apps.md#native-settings)); die `permissions`-Begründungen der App ersetzen die eines Moduls. |
| `android.class`        | Die vollqualifizierte Kotlin-Klasse, die das generierte `<Name>Spec` implementiert, in `android/`.                                                                                                                                                                                            |
| `android.dependencies` | Gradle-Koordinaten, `group:artifact:version`, als `implementation` hinzugefügt.                                                                                                                                                                                                               |
| `android.permissions`  | `uses-permission`-Einträge, die in das Manifest der App gemergt werden.                                                                                                                                                                                                                       |
| `android.features`     | `uses-feature`-Einträge: `name` und `required` (true, sofern nicht `false` angegeben). Google Play blendet eine App auf Geräten aus, denen ein erforderliches Feature fehlt, daher gibt ein Modul, dessen App ohne die Hardware funktioniert, `false` an.                                     |
| `android.providers`    | `<provider>`s unter `<application>`: Attribute ohne `android:` (`name` und `authorities` erforderlich; `${applicationId}` funktioniert) und `resources`, `<meta-data>`, das eine Ressource benennt, die das Modul in `android/res/` ausliefert.                                               |
| `android.services`     | `<service>`s unter `<application>`: Attribute ohne `android:`, `name` erforderlich, etwa der `foregroundServiceType` eines Vordergrunddienstes.                                                                                                                                               |

Das `android/res/`-Verzeichnis eines Moduls, wenn es eines hat, wird Teil der
Ressourcen der Shell, sodass die Meta-Daten eines Providers eine XML-Datei
dort benennen können. Ressourcennamen erhalten den des Moduls als Präfix
(`kuito_image_picker_paths`): Die Ressourcen aller eingeschlossenen Module
teilen sich einen Namespace.

Eine Spezifikation muss `ios` oder `android` deklarieren. Ein Abschnitt ohne
seinen Quellordner (`ios/` mit `.swift`-Dateien, `android/` mit `.kt`) oder
Quellen ohne ihren Abschnitt sind ebenfalls ein Fehler.

### Ein eingebautes Modul hinzufügen

Ein Modul, das mit Kuito ausgeliefert wird, besteht aus denselben drei
Teilen, in `native/modules/<name>/`: der Spezifikation `<name>.ts`, die
`defineModule` aus `src/native/define-module.ts` importiert, sowie `ios/` und
`android/`, mit Kotlin in `dev.kuito.runtime.modules.<name>`. Die App-API ist
ein Namespace in `src/native/<name>.ts`, der die Member der Spezifikation
einzeln re-exportiert, exportiert aus `src/native/index.ts`, sodass eine App,
die keinen davon aufruft, das Modul fallen lässt. `always` wird nur gesetzt,
wenn der eigene Code der Shell die Klassen des Moduls aufruft.

## Fehler

<!-- error codes: generated from src/protocol/modules.ts -->

| Code                     | Bedeutung                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `ERR_FUNCTION_NOT_FOUND` | Die Link-Tabelle der Shell enthält die Funktion nicht: neu bauen.                       |
| `ERR_VIEW_NOT_FOUND`     | Die View einer View-Funktion ist nicht gemountet.                                       |
| `ERR_ARGUMENT`           | Ein Argument ließ sich nicht in den deklarierten Typ dekodieren.                        |
| `ERR_ENCODE`             | Ein Ergebnis oder eine Ereignis-Payload ist kein JSON.                                  |
| `ERR_NATIVE`             | Die Funktion hat etwas anderes als `KuitoModuleError` geworfen.                         |
| `ERR_THREAD`             | Ein synchroner Aufruf hat eine asynchrone Funktion erreicht.                            |
| `ERR_NO_ACTIVITY`        | Das Modul benötigt die Activity, und ein Hintergrund-Task läuft ohne eine. Nur Android. |

<!-- end of generated error codes -->

Eine synchrone Funktion wirft ihren Fehler beim Aufruf. Eine asynchrone lehnt
ab. Argumente, die nicht zur Spezifikation passen, schlagen im Kernel fehl,
bevor etwas die Grenze überquert, mit dem `ERR_ARGUMENT` des Hosts. In beiden
Fällen ist der Fehler ein `NativeModuleError` mit `code`, und seine
Nachricht benennt Modul und Funktion (`Clipboard.writeText failed: …`): die
eigenen Namen des nativen Moduls, die der Namespace kapselt. Ein
Ereignis-Listener, der wirft, wird an die LogBox gemeldet, und die anderen
Listener laufen weiterhin.

## Wire-Format

Eine Modulfunktion überquert die Host-Grenze über ihre Id, von
`src/runtime/link.ts` durch `native/shared/KuitoRuntime.cpp` bis zum Linker
jeder Plattform (`KuitoLinker`) und dessen generiertem `KuitoLink`:

| Host-Funktion                             | Gibt zurück                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `__kuitoHostCall(id, ...args)`            | das Ergebnis einer `js`-Funktion; ein Fehlschlag wirft `__kuitoLinkError(id, code, message)`                              |
| `__kuitoHostCallAsync(id, call, ...args)` | nichts; der Host ruft später `__kuitoLinkSettle(call, value)` oder `__kuitoLinkFail(call, code, message)` auf             |
| `__kuitoHostObserve(id, observing)`       | nichts; während der Beobachtung ruft der Host `__kuitoLinkEmit(id, value)` für ein Ereignis oder einen Live-Wert auf      |
| `__kuitoUIHostCall(id, ...args)`          | auf dem UI-Thread das Ergebnis einer `main`-Funktion, sofort ausgeführt ([UI-Thread-Aufrufe](#calls-from-ui-thread-code)) |

Werte überqueren die Grenze als typisierte JSI-Werte (native/shared/Link.h,
LinkJSI.h): null, Booleans, Zahlen und Strings als solche, die erste Ebene
eines Objekts als seine Felder und nur verschachtelte Daten als JSON-Text.
Ergebnisse kommen auf demselben Weg zurück. Ein Fehlschlag ist die eine
Antwort mit einem Code und einer Nachricht. Ein Host ohne diese Funktionen
(der `node:vm`-Host der Tests) hat keine nativen Module, daher schlägt ein
Modul dort bei der ersten Verwendung mit einer Nachricht fehl, die das sagt.

## Die Modul-API ist versioniert

Native Module sind Kuitos stabiler öffentlicher Vertrag: **Modul-API 1**. Die
Module einer App und später Modulpakete von Drittanbietern hängen davon ab,
daher ändert er sich nur auf Weisen, bei denen bestehende Module weiterhin
kompilieren und sich gleich verhalten. Der Vertrag umfasst:

- die Spezifikation: `defineModule`, `fn.sync`, `fn.main`, `fn.background` und
  ihre `.callback`, `event`, `live` und `view`, die Typen, die eine
  Spezifikation verwenden darf, und ihre [nativen Anforderungen](#native-needs);
- das generierte `<Name>Spec`-Protokoll und -Interface und wie jeder Member
  darauf abgebildet wird;
- `KuitoLinkedModule` (`init(context:)`, `destroy()`), `KuitoModuleContext`,
  `KuitoModuleError`, `KuitoPromise`, `KuitoEmitter`, `KuitoSignal`,
  `KuitoModuleView` mit `KuitoNativeView` und `KuitoViewEvents` sowie
  Kotlins `KuitoType` und `KuitoActivityResults`;
- die Fehlercodes oben (`KuitoErrorCode` in Swift und Kotlin).

Innerhalb von Version 1 fügen Änderungen nur hinzu: eine neue Deklaration,
eine neue native Anforderung, einen neuen Fehlercode. Eine Änderung, die ein
Modul brechen würde, wird als API 2 ausgeliefert, hier aufgeführt mit dem, was
zu ändern ist. Alles andere, einschließlich der Host-Funktionen im
[Wire-Format](#wire-format) und der Ids der Link-Tabelle, ist intern und kann
sich in jedem Release ändern.
