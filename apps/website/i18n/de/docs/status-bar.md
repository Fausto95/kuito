# StatusBar

Stil, Sichtbarkeit und, auf Android, Farbe der Statusleiste. Rendern Sie sie
als Komponente, solange sie gemountet ist, oder geben Sie jeder Route ihre
eigene.

```tsx
import { Route, Router, StatusBar } from 'kuito';

function Player() {
  return (
    <>
      <StatusBar content="light" hidden animated transition="slide" />
      <Video />
    </>
  );
}

<Router>
  <Route path="/" screen={Home} />
  <Route path="/photo/:id" screen={Photo} statusBar={{ content: 'light', hidden: true }} />
</Router>;
```

## Props

| Prop              | Werte                                           | Plattformen                   |
| ----------------- | ----------------------------------------------- | ----------------------------- |
| `content`         | `auto`, `light`, `dark`                         | beide                         |
| `hidden`          | boolean                                         | beide                         |
| `animated`        | animiert `content`, `hidden`, `backgroundColor` | beide                         |
| `transition`      | `fade` (Standard), `slide`, `none`              | iOS; Android hat seine eigene |
| `backgroundColor` | eine Hex-Farbe oder `transparent`               | Android; auf iOS ignoriert    |
| `translucent`     | true (Standard) oder false                      | Android; auf iOS ignoriert    |

`auto` ist der Stil, mit dem die App gestartet wurde: `statusBar.style` in
kuito.config.ts, `auto`, sofern nicht gesetzt, was auf beiden Plattformen
dunkler Text im hellen Modus und heller Text im dunklen Modus ist. Farben sind
CSS-Hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) oder `transparent`; alles
andere ist ein `TypeError`, bevor es die Plattform erreicht.

## Der Stack

Jede gemountete `<StatusBar>` ist ein Eintrag in einem Stack. Der letzte
Eintrag, der ein Prop setzt, gewinnt dieses Prop, und das Unmounten eines
Eintrags gibt seine Props an die darunterliegenden zurück, mit dem `animated`
des Eintrags, der sie gesetzt hat. Eine `<StatusBar>`, deren Props sich ändern,
behält ihren Platz. Gemeinsam vorgenommene Änderungen, wie das Mounten der
StatusBars eines Screens, gehen einmal zur Plattform über, und nur das, was
sich von dem unterscheidet, was die Plattform anzeigt.

Es gibt keine imperativen Setter: Sie würden den Stack umgehen, und der
Gültigkeitsbereich der Komponente sagt bereits, wie lange ein Stil gilt.
`StatusBar.height` ist die Höhe der Statusleiste in dp auf Android, synchron
gelesen; null auf iOS.

Der Stack überlebt einen Live Patch: Gemountete StatusBars behalten ihre
Einträge, wenn das Bundle der App erneut läuft.

## Pro Screen

Das `statusBar` einer `<Route>` nimmt die Props einer `<StatusBar>` entgegen
und wendet sie an, solange ihr Screen fokussiert ist: das oberste Sheet oder
das oberste Element des Stacks des ausgewählten Tabs
([Navigation](navigation.md)). Der Router verschiebt diesen Eintrag an die
Spitze des Stacks, bevor der fokussierte Screen rendert, sodass er über
StatusBars gewinnt, die vor dem Erscheinen des Screens gemountet wurden, und
die eigenen `<StatusBar>`-Elemente des Screens weiterhin über ihn gewinnen.
Zurückgehen stellt den Screen darunter wieder her.

Eine in einem Screen gerenderte `<StatusBar>` zählt, solange der Screen
gemountet ist, wie in React Native: Screens weiter unten in einem Stack und
andere Tabs bleiben gemountet, und ihre StatusBars bleiben im Stack, unter den
neueren. Für einen Stil pro Tab verwenden Sie die `statusBar`-Option der
Routen.

## Wie es verdrahtet ist

`StatusBar` und [`SystemBars`](system-ui.md) teilen sich das native Modul
`SystemUI`. Auf iOS lebt der Zustand in `KuitoSystemBars`, das der
Root-View-Controller der Shell für `preferredStatusBarStyle`,
`prefersStatusBarHidden` und `preferredStatusBarUpdateAnimation` liest
(View-Controller-basiertes Statusleisten-Erscheinungsbild); die Shell
initialisiert es mit dem Startstil aus kuito.config.ts. Der Stack beginnt mit
dem `hidden` des Starts, synchron gelesen, sodass das Zurückgeben von `hidden`
die konfigurierte Statusleiste wiederherstellt. `SystemUI` ist in den Shells
`always`, weil der Root-View-Controller seinen Zustand liest. Auf Android setzt
`WindowInsetsControllerCompat` die Icons und die Sichtbarkeit. Android 15
zeichnet jede App randlos und ignoriert `Window.statusBarColor`, sodass
`backgroundColor` eine View in der Decor-View ist, so hoch wie das Inset der
Statusleiste, auf jeder Version gleich; `translucent: false` polstert
stattdessen den Inhalt unterhalb der Statusleiste, sodass eine `SafeArea` dort
kein oberes Inset bekommt. Ein Reload gibt die Statusleiste der Shell zurück.

React Natives `networkActivityIndicatorVisible` gibt es nicht: iOS 13 hat den
Indikator entfernt.
