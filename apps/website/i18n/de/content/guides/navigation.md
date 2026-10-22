# Navigation

Routen sind typisierte Werte, gezeigt in nativen Stacks und Tableisten: `UINavigationController` und `UITabBarController` auf iOS, ein nativer Stack mit Predictive Back und Materials Bottom Navigation auf Android.

## Routendateien

Eine App ist ein Verzeichnis aus Routendateien; der Compiler macht daraus `routes`, eine typisierte Funktion pro Route. Jede `.tsx`- oder `.jsx`-Datei darin ist eine Route, es sei denn, ihr Name oder ein Verzeichnis darüber beginnt mit `_` oder `.`.

```text
app/
  _layout.tsx                export const tabs = [{ name: 'shows', title: 'Shows', icon: 'tv' }]
  (shows)/index.tsx          routes.index()            /
  (shows)/show/[id].tsx      routes.show({ id: 42 })   /show/:id
  rate.tsx                   routes.rate({ show })     /rate, a sheet
```

- Der Default-Export ist der Screen. Er erhält die Parameter der Route als Props sowie `dismiss`.
- `export const options: RouteOptions<Params>` liefert den Rest: `title`, `presentation` (`'push'`, der Standard, oder `'sheet'`), `header`, `statusBar`.
- Der Pfad der Datei ist der Deep-Link-Pfad der Route: `index` benennt den Pfad seines Verzeichnisses, `[name]` ist ein `:name`-Parameter und `[...name]` ein abschließendes Catch-all. `(name)`-Verzeichnisse gruppieren Dateien, ohne ein Segment hinzuzufügen.
- `_layout.tsx` deklariert die Tableiste: `export const tabs`, ein Array aus `{ name, title, icon }`. Jede `(name)`-Gruppe auf oberster Ebene ist der Tab dieses Namens; Dateien außerhalb der Gruppen gehören zu keinem Tab. Ohne `tabs` ist die App ein Stack.

## Die Routentabelle

`routes` hat eine Funktion pro Route, benannt nach den statischen Segmenten der Route in camelCase: `index` für `/`, `showCast` für `show/[id]/cast.tsx`. Mit den Parametern der Route aufgerufen, gibt sie eine `Destination` zurück, den Wert, den `navigate`, `present` und `<Link to>` nehmen. `routes.show({ id: '42' })` ist ein Typfehler.

Die Parameter einer Route sind die ihres Pfads, als Strings, sofern die Datei ihre Typen nicht deklariert:

```tsx
export type Params = { id: number; tab?: string };
```

`Params` hat `string`-, `number`- und `boolean`-Member: jeder Parameter, den der Pfad nennt, keiner optional; die anderen stammen aus dem Query-String eines Deep Links. Der Compiler schreibt die Typen der Tabelle nach `routes.generated.d.ts`; mit den Routen committen.

## Zwischen Routen wechseln

```tsx
import { Link, navigate, routes } from 'kuito';

navigate(routes.show({ id: 42 }));
<Link to={routes.show({ id: 43 })}>Next show</Link>;
```

- `navigate(to)`: zeigt das Ziel. Eine Route in einem anderen Tab wählt diesen Tab; jede andere Route wird auf ihren Stack gepusht. Eine Sheet-Route öffnet ein Sheet.
- `navigate(to, { replace: true })`: ersetzt stattdessen den obersten Screen.
- `present(to)`: zeigt das Ziel immer als neuen Screen und löst mit seinem Ergebnis auf.
- `goBack()`: schließt das oberste Sheet oder poppt den aktuellen Stack.
- `<Link to replace>`: ein Pressable, das navigiert.

Ein Screen bleibt gemountet, mit seinem Zustand, während Screens darüber gepusht werden und während man Tabs wechselt; ihn zu poppen unmountet ihn.

## Screen-Ergebnisse

`present` löst mit dem Ergebnis auf, das der präsentierte Screen an seine `dismiss`-Prop übergibt, was ihn auch schließt, oder mit `undefined`, wenn der Screen auf andere Weise verschwindet.

```tsx
// app/rate.tsx
export type Result = number;

export default function Rate({ dismiss }: ScreenProps<{}, Result>) {
  return <Pressable onPress={() => dismiss(5)}>Five stars</Pressable>;
}

// anywhere
const stars = await present(routes.rate()); // number | undefined
```

## Deep Links

Ein Link ist die einzige Stelle, an der eine Route ein String ist. `export const linking = true` in `_layout.tsx` folgt den Links, die die App öffnen; standardmäßig sind sie aus. Ein Link wird zum Ziel der ersten Route, deren Pfad zu ihm passt, navigiert wie mit `navigate`.

Jeder Pfadparameter wird aus seinem Segment nach seiner Art geparst: `/show/42` ist `routes.show({ id: 42 })`, wenn `id` eine Zahl ist. Ein Segment, das nicht parst, passt nicht; ein Link, zu dem keine Route passt, ist eine Konsolenwarnung, die ihn nennt.

Die Schemes und Domains, die die App öffnen, stammen aus `kuito.config.ts`: `urlSchemes` und `linkDomains` ([Linking](../../../../docs/linking.md#the-apps-url-scheme)).

## Vertiefung

[Navigation](../../../../docs/navigation.md) behandelt Routenmodule und Kaltstart, Shared-Element-Übergänge, Tab-Icons, den `<Router>`-Baum in JSX, was ein Live Patch behält, und den nativen Vertrag.
