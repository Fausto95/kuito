# Navigation

Routen sind typisierte Werte, die in nativen Stacks und Tab-Leisten angezeigt werden:
UIKits `UINavigationController` und `UITabBarController` auf iOS, ein nativer Stack mit
Predictive Back und Materials Bottom Navigation auf Android. Das Zurückgehen folgt der
Plattform: die Wischgeste vom Rand auf iOS, die Zurück-Geste und der Zurück-Button auf
Android.

Eine App ist ein Verzeichnis von Routendateien; der Compiler macht daraus die Routentabelle
und `routes`, eine typisierte Funktion pro Route:

```text
app/
  _layout.tsx                export const tabs = [{ name: 'shows', title: 'Shows', icon: 'tv' }, …]
  (shows)/index.tsx          routes.index()            /
  (shows)/show/[id].tsx      routes.show({ id: 42 })   /show/:id
  (library)/library.tsx      routes.library()          /library, the "library" tab
  rate.tsx                   routes.rate({ show })     /rate, a sheet
  routes.generated.d.ts      the types of routes, written by the compiler
```

```tsx
// app/(shows)/show/[id].tsx
import { Link, present, routes, signal, type RouteOptions, type ScreenProps } from 'kuito';

export type Params = { id: number };

export const options: RouteOptions<Params> = { title: ({ id }) => `Show ${id}` };

export default function Show({ id }: ScreenProps<Params>) {
  const stars = signal<number | undefined>(undefined);

  return (
    <>
      <Link to={routes.show({ id: id + 1 })}>Next show</Link>
      <Pressable onPress={async () => (stars.value = await present(routes.rate({ show: id })))}>
        <Text>{stars.value === undefined ? 'Rate it' : `${stars.value} stars`}</Text>
      </Pressable>
    </>
  );
}
```

`routes.show({ id: '42' })` ist ein Typfehler, ebenso eine Route, die nicht existiert.
Nur ein Deep Link ist eine URL: [Deep Links](#deep-links) bilden einen auf eine Route ab.

## Routendateien

`kuito dev ios --entry app` führt ein App-Verzeichnis aus (eine mit `kuito create`
erstellte App ist eines). Jede `.tsx`- oder `.jsx`-Datei darin ist eine Route, es sei denn,
ihr Name oder ein Verzeichnis darüber beginnt mit `_` oder `.` (Hilfsdateien gehören
dorthin; `.ts`-, `.css`- und andere Dateien sind ebenfalls nie Routen).

- Der Default-Export ist der Screen. Er erhält die Parameter der Route als Props sowie
  `dismiss` ([Ergebnisse](#screen-results)).
- `export const options: RouteOptions<Params>` liefert den Rest: `title` (ein String oder
  eine Funktion der Parameter), `header`, `presentation` (`'push'`, der Standard, oder
  `'sheet'`), `backgroundColor` (die des gesamten Screens, auch unter den Leisten: Der
  Inhalt wird vom sicheren Bereich eingerückt, so wie UIKit und Android ihn einrücken),
  `snapPoints` (die Höhen einer Sheet-Route, so wie [`<Sheet snapPoints>`](primitives.md)
  sie entgegennimmt) und `systemBars`, die Props einer `<SystemBars>`, die angewendet werden,
  solange der Screen den Fokus hat ([SystemBars](system-ui.md#per-screen)).
- Der Pfad der Datei ist der Deep-Link-Pfad der Route: `index` benennt den Pfad seines
  Verzeichnisses, `[name]` ist ein `:name`-Parameter und `[...name]` ein abschließendes
  Catch-all, das in `name` abgeglichen wird. Eine Klammer muss der ganze Name sein.
  `(name)`-Verzeichnisse gruppieren Dateien, ohne ein Segment hinzuzufügen.
- `_layout.tsx` deklariert die Tab-Leiste: `export const tabs`, ein Array aus
  `{ name, title, icon }`, mit `icon`, wie `<Tab>` es entgegennimmt (ein Name,
  `{ ios, android }` oder `{ uri }`). Jede `(name)`-Gruppe auf oberster Ebene ist der Tab
  mit diesem Namen, in der Reihenfolge des Arrays, und jede Gruppe auf oberster Ebene muss
  einer sein. Dateien außerhalb der Gruppen gehören zu keinem Tab: Sheets, neben der
  Tab-Leiste. Ohne `tabs` ist die App ein einziger Stack, und Gruppen ordnen nur Dateien.
  `export const linking = true` schaltet [Deep Links](#deep-links) ein. Der Compiler liest
  beides, ohne die Datei auszuführen, daher ist jedes ein Literal, und eine `_layout.tsx`
  darf auch nur eines von beiden exportieren.
- Routen werden so geordnet, dass der erste Treffer der spezifischste ist und die flachste
  Route eines Stacks sein erster Screen: Catch-alls zuletzt, dann weniger Segmente, dann
  statische Segmente vor Parametern.

Zwei Dateien mit demselben Pfad oder demselben Namen, ein Tab ohne Routen, eine Gruppe ohne
Tab und eine `_layout.tsx` oder eine Deklaration, die der Compiler nicht lesen kann, sind
Compile-Fehler, die die Datei benennen.

## Die Routentabelle

`routes` hat eine Funktion pro Route, benannt nach den statischen Segmenten der Route in
camelCase: `index` für `/`, `show` für `show/[id].tsx`, `showCast` für
`show/[id]/cast.tsx`, `myList` für `my-list.tsx`. Ein Pfad nur aus Parametern wird nach
ihnen benannt (`[...rest].tsx` ist `rest`). Aufgerufen mit den Parametern der Route gibt
sie eine `Destination` zurück, den Wert, den `navigate`, `present` und `<Link to>`
entgegennehmen; eine Route ohne Parameter nimmt keine.

```tsx
export const name = 'shows'; // in show.tsx, which show/[id].tsx would also name routes.show
```

Zwei Routen, die sich einen Namen teilen würden, sind ein Compile-Fehler, bis eine ihren
eigenen mit `export const name` deklariert, einem Bezeichner-String-Literal.

Die Parameter einer Route sind die ihres Pfads, als Strings, es sei denn, die Datei
deklariert ihre Typen:

```tsx
export type Params = { id: number; tab?: string };
```

`Params` ist ein Typliteral (oder ein Interface) aus `string`-, `number`- und
`boolean`-Membern: Ein Deep Link transportiert jeden als Text, also muss sich jeder daraus
parsen lassen. Es enthält jeden Parameter, den der Pfad benennt, keiner davon optional; die
übrigen kommen aus dem Query-String eines Deep Links. Ein Parameter darf nicht `dismiss`
heißen.

Der Compiler schreibt die Typen der Tabelle bei jedem Build nach `routes.generated.d.ts`
im App-Verzeichnis, und `kuito create` liefert sie mit, sodass ein Editor und `tsc` jede
Route prüfen, bevor die App läuft. Sie erweitert `Routes`, das Interface, über das `routes`
typisiert ist; die Datei wird zusammen mit den Routen committet.

## Routenmodule

Jede Routendatei kompiliert zu einem eigenen Modul (einem Chunk, wobei das, was die
Routendateien gemeinsam haben, in Chunks daneben aufgeteilt wird), und das Modul einer
Route läuft, wenn die Route zum ersten Mal angezeigt wird. Ein Kaltstart wertet den
Kernel, die Wurzel (die Routentabelle) und das Modul des ersten Screens aus, sonst nichts;
ein Tab mountet seine Screens und führt deren Module aus, wenn er zum ersten Mal ausgewählt
wird.

- Der Compiler liest die `presentation` einer Route aus ihren `options`, ohne das Modul
  auszuführen, da er entscheidet, wo die Route angezeigt wird, bevor das Modul lädt: Sie
  ist ein `'push'`- oder `'sheet'`-Literal in einem `options`-Objektliteral.
- Ein Release-Build kompiliert jeden Chunk für sich zu Hermes-Bytecode, neben `app.hbc`:
  `Modules/` im iOS-Bundle, `assets/kuito/modules/` in der APK. Das erste Require eines
  Chunks wertet seine Datei innerhalb des Jobs aus, der ihn angefordert hat, sodass das
  Navigieren synchron bleibt, und zeichnet es als
  `Kuito evaluate kuito://modules/<chunk>` auf.
- Ein Live Patch sendet jeden Chunk der Revision in einem Skript, das sie definiert und
  die Wurzel erneut ausführt; das Modul jeder Route läuft erneut, wenn ihr Screen neu
  rendert, sodass eine gepatchte Routendatei an Ort und Stelle wirksam wird.

## Zwischen Routen wechseln

- `navigate(routes.show({ id }))`: zeigt das Ziel an. Eine Route in einem anderen Tab
  wählt diesen Tab aus; die erste Route eines Tabs poppt diesen Tab zu ihr zurück; jede
  andere Route wird auf ihren Stack gepusht, es sei denn, sie liegt bereits mit denselben
  Parametern obenauf. Eine Sheet-Route öffnet ein Sheet.
- `navigate(to, { replace: true })`: ersetzt stattdessen den obersten Screen.
- `present(to)`: zeigt das Ziel immer als neuen Screen an (auf seinen Stack gepusht oder
  als Sheet) und löst mit seinem [Ergebnis](#screen-results) auf.
- `goBack()`: schließt das oberste Sheet oder poppt den aktuellen Stack. Auf dem ersten
  Screen eines Stacks tut es nichts (Androids Zurück verlässt dann die App).
- `<Link to replace>`: ein Pressable, das navigiert.

Ein Screen bleibt mit seinem Zustand gemountet, während Screens über ihm gepusht werden,
und in einem Tab, während man zwischen Tabs wechselt. Das Poppen eines Screens unmountet
ihn. Ein Tab mountet seine Screens, wenn er zum ersten Mal ausgewählt wird.

Ein Ziel, dessen Route in der Tabelle fehlt oder dessen Parameter nicht zu ihr passen (ein
fehlender Pfadparameter, ein Wert der falschen Art), ist ein Fehler, der die Route benennt.

## Screen-Ergebnisse

Ein Screen kann dem Screen antworten, der ihn angezeigt hat. `present` löst mit dem
Ergebnis auf, das der präsentierte Screen an seine `dismiss`-Prop übergibt, was ihn auch
schließt; es löst mit `undefined` auf, wenn der Screen auf eine andere Weise verschwindet:
Der Benutzer wischt ihn weg oder geht zurück, `goBack`, ein `navigate`, das ihn ersetzt
oder poppt, oder ein Live Patch, der seine Route entfernt.

```tsx
// app/rate.tsx
export type Result = number;

export const options: RouteOptions = { presentation: 'sheet' };

export default function Rate({ dismiss }: ScreenProps<{}, Result>) {
  return <Pressable onPress={() => dismiss(5)}>…</Pressable>;
}

// anywhere
const stars = await present(routes.rate()); // number | undefined
```

Der `Result`-Typ der Datei ist der des Ergebnisses: `present(routes.rate())` ist ein
`Promise<number | undefined>`. Der Kernel bewahrt das ausstehende Promise zusammen mit dem
Navigationszustand auf, über das Push, das Pop und jeden Live Patch dazwischen hinweg.

## Geteilte Elemente

Eine View mit einer `sharedId` fliegt zu der View mit derselben `sharedId` auf dem Screen,
zu dem ein Stack pusht oder poppt: Ein Poster in einer Liste wächst zum Header-Bild des
Detail-Screens heran und schrumpft beim Zurückgehen wieder.

```tsx
// app/(shows)/index.tsx
<Link to={routes.show({ id: show.id })}>
  <Image sharedId={`poster-${show.id}`} src={show.poster} width={80} height={120} />
</Link>

// app/(shows)/show/[id].tsx
<Image sharedId={`poster-${id}`} src={poster(id)} width="100%" aspectRatio={2 / 3} />
```

- Der Stack nimmt einen Schnappschuss der verlassenden View und bewegt den Schnappschuss
  vom Rahmen dieser View zu dem der ankommenden View, parallel zum plattformeigenen Push
  oder Pop, mit dessen Dauer und Easing; beide Views sind ausgeblendet, während er fliegt.
- iOS: jedes animierte Push und Pop, einschließlich der interaktiven Wischgeste vom Rand,
  die den Flug mit dem Finger steuert und ihn zurücksetzt, wenn die Geste abgebrochen wird.
- Android: Pushes und Pops, die die App oder der Zurück-Button auslöst. Eine
  Predictive-Back-Geste bewegt die Seiten mit dem Finger, und das Pop, in dem sie endet,
  hat keinen Flug.
- Eine `sharedId` ist innerhalb eines Screens eindeutig; eine zweite View mit derselben auf
  diesem Screen fliegt nicht. Views, die nur auf einem der beiden Screens vorhanden sind,
  fliegen nicht. Sheets nehmen nicht teil.

## Icons

Das `icon` eines Tabs ist das plattformeigene Symbol, per Name, oder ein beliebiges Bild:

- Ein String: ein [SF Symbol](https://developer.apple.com/sf-symbols/) auf iOS, ein
  [Material Symbol](https://fonts.google.com/icons) auf Android, als `icon="star"`. Ein
  literaler Name, den eine Plattform nicht kennt, ist ein Compile-Fehler an seiner Zeile,
  wie bei [`<Symbol>`](assets.md#symbols).
- `{ ios, android }`: ein Name pro Plattform, da sich die meisten unterscheiden:
  `icon={{ ios: 'house', android: 'home' }}`. Eine ausgelassene Plattform zeigt kein Icon.
- `{ uri }`: ein beliebiges Bild, wie `<Image src>` (https-, file- oder data-URI), geladen
  und gecacht wie ein `Image`. Eines, das nicht geladen werden kann, ist ein Fehler, der
  seinen Tab benennt.

```tsx
<Tab name="top" title="Top rated" icon={{ uri: 'https://example.com/star.png' }}>
```

Die Tab-Leiste passt jedes Icon in das Quadrat eines Symbols ein (25 Punkte auf iOS, 24 dp
auf Android) und färbt es anhand seines Alphakanals: Bild-Icons sind als Form auf
Transparenz zu zeichnen. Android zeichnet Material Symbols aus der Outlined-Schrift, die
Kuito mitliefert, in regulärer Strichstärke.

## Routen in JSX

Die Tabelle des Compilers ist derselbe `<Router>`-Baum, den eine App von Hand schreiben
kann, die dann die Typen ihrer Routen selbst deklariert:

```tsx
import { Link, Route, Router, Tab, Tabs, routes, type RouteTo } from 'kuito';

declare module 'kuito' {
  interface Routes {
    index: RouteTo;
    show: RouteTo<{ id: number }>;
    settings: RouteTo;
  }
}

export default function App() {
  return (
    <Router linking>
      <Tabs>
        <Tab name="discover" title="Discover" icon={{ ios: 'safari', android: 'explore' }}>
          <Route name="index" path="/" screen={Discover} title="Discover" />
          <Route
            name="show"
            path="/show/:id"
            params={{ id: Number }}
            screen={Show}
            title={({ id }) => `Show ${id}`}
          />
        </Tab>
      </Tabs>
      <Route name="settings" path="/settings" screen={Settings} presentation="sheet" />
    </Router>
  );
}
```

- `<Router initial linking>`: die Navigation der App. Eine App hat einen; ein zweiter ist
  ein Fehler. `initial` ist das erste angezeigte Ziel (standardmäßig das der ersten
  Route); `linking` folgt [Deep Links](#deep-links).
- `<Route name path params screen title presentation backgroundColor snapPoints header statusBar>`:
  `name` ist ihr Schlüssel in `routes`; `path` ist das, womit der Pfad eines Deep Links
  abgeglichen wird (Segmente, `:name`-Parameter und ein abschließendes `*name`); `params`
  gibt an, wie der Text eines Links in jeden Parameter geparst wird, `String` (der
  Standard), `Number` oder `Boolean`; der Rest sind die [Optionen](#route-files).
- `<Tabs>` mit `<Tab name title icon>`-Kindern: eine native Tab-Leiste. Jeder Tab ist ein
  eigener Stack der Routen in ihm, der beim Wechseln zwischen Tabs erhalten bleibt.
- Routen direkt in `<Router>` (keine Sheets) bilden einen einzigen Stack ohne Tabs.

## Deep Links

Ein Link ist die einzige Stelle, an der eine Route ein String ist. `<Router linking>` oder
`export const linking = true` in `_layout.tsx` folgt den Links, die die App öffnen
([linking.md](linking.md)): dem Link, mit dem sie gestartet wurde, sobald der Router
gemountet ist, und jedem Link, der eintrifft, während sie läuft. Ein Link wird zum Ziel der
ersten Route, deren Pfad zu ihm passt, und wird so angesteuert, wie `navigate` es täte,
sodass eine Route in einem anderen Tab diesen Tab auswählt und eine Sheet-Route ein Sheet
öffnet.

- Der Pfad folgt dem Schema: `kuito://show/42` und `kuito:///show/42` sind `/show/42`
  (nach einem benutzerdefinierten Schema ist der Host das erste Segment), und
  `https://kuito.dev/show/42` ist `/show/42` (der Host eines Web-Links ist die Site).
- Jeder Pfadparameter wird aus seinem Segment nach seiner Art geparst: `/show/42` ist
  `routes.show({ id: 42 })`, wenn `id` eine Zahl ist. Ein Segment, das sich nicht parsen
  lässt (`/show/forty`), passt nicht.
- Parameter, die der Pfad nicht benennt, kommen aus der Query, auf dieselbe Weise geparst:
  `/search?q=bear&page=2`. Query-Schlüssel, für die die Route keinen Parameter hat, und
  das Fragment werden ignoriert.
- Ein Link, zu dem keine Route passt, ist eine Konsolenwarnung, die ihn benennt, und ändert
  nichts.
- Deep Links sind standardmäßig aus: Ein Link kann jede Route öffnen, daher schaltet eine
  App sie ein, wenn ihre Routen bereit sind, Einstiegspunkte zu sein.

Die Schemata und Domains, die die App öffnen, sind ihre eigenen, aus `kuito.config.ts`:
`urlSchemes` und `linkDomains` ([linking.md](linking.md#the-apps-url-scheme)).

## Live Patch

Ein Patch, der Routendateien oder die Tabs und Routen des Routers bearbeitet, wendet sie an
Ort und Stelle an: Stacks, Sheets, der ausgewählte Tab und der Zustand jedes gemounteten
Screens bleiben erhalten. Ein Tab ist derselbe Tab anhand seines `name`, eine Route
dieselbe Route anhand von Name, `presentation` und Tab, sodass Tabs und Routen umsortiert,
hinzugefügt, umbenannt oder mit neuen Pfaden versehen werden können.

- Ein Screen, dessen Route der Patch entfernt (oder in einen anderen Tab verschoben) hat,
  schließt sich, zusammen mit den Screens über ihm in seinem Stack, und ein `present`, das
  auf ihn wartet, löst mit `undefined` auf. Ein Sheet ebenso.
- Ein neuer Tab oder ein Stack, der ohne Screen zurückbleibt, beginnt auf seiner ersten
  Route.
- Der ausgewählte Tab folgt seinem `name`; hat der Patch ihn entfernt, wird der erste Tab
  ausgewählt.

## Nativer Vertrag

Beide Renderer implementieren vier Arten, die `properties/KuitoNavigationProperties` und
ihren Views in `views/` gehören:

- `NavigationStack`: ein nativer Stack. Seine Kinder sind `NavigationScreen`-Views, von
  unten nach oben. Ein oben hinzugefügtes Kind wird gepusht, animiert, sofern es nicht das
  erste ist; das Entfernen des obersten Kindes poppt es, animiert; jede andere Änderung der
  Reihenfolge setzt den Stack ohne Animation. Der Teilbaum jedes Screens wird als eigene
  Wurzel gelayoutet, in dem Rahmen, den der native Stack ihm gibt (unterhalb des Headers).
- `NavigationScreen`: Props `title` (String) und `header` (Boolean, Standard true). Es
  emittiert `dismiss`, wenn die Plattform es entfernt hat: die iOS-Wischgeste vom Rand oder
  der Zurück-Button, Androids Zurück-Geste, Zurück-Button oder Header-Pfeil. Es emittiert
  es nicht für eine Entfernung, die der Kernel angefordert hat. Nach `dismiss` entfernt der
  Kernel die View; der Renderer behandelt das Entfernen eines bereits gepoppten Screens als
  erledigt.
- `NavigationTabs`: eine native Tab-Leiste. Seine Kinder sind `NavigationTab`-Views, in
  Reihenfolge. Prop `selectedIndex` (Zahl). Es emittiert `select` mit `{ index }`, wenn der
  Benutzer einen Tab wählt; die Auswahl ändert sich, wenn der Kernel `selectedIndex` setzt.
- `NavigationTab`: Props `title` (String) und `icon`: ein Symbolname (SF Symbol auf iOS,
  Material Symbol auf Android), oder als JSON `{ ios, android }`, wobei jeder Renderer
  seinen eigenen Schlüssel nimmt, oder `{ uri }`, geladen über den Bildlader der Plattform.
  Es emittiert `error` mit `{ error }`, wenn ein Bild-Icon nicht geladen werden kann. Sein
  einziges Kind ist der `NavigationStack` des Tabs.

Auf Android behandelt der oberste sichtbare Stack mit mehr als einem Screen das Zurückgehen
(Predictive Back ab API 34, dem Fortschritt der Geste folgend); andernfalls geht Zurück an
das System.

## Danksagungen

Android zeichnet Tab-Icons mit der Outlined-Schrift der [Material Symbols](https://github.com/google/material-design-icons),
instanziiert in regulärer Strichstärke
(`native/android/app/src/main/res/font/material_symbols.ttf`): Apache License 2.0,
Copyright Google LLC (`native/android/app/src/main/LICENSE-material-symbols`).
