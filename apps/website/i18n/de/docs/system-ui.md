# SystemBars

Das System-Chrome rund um die App, als Komponente deklariert: die Statusleiste, die Farbe der
Root-View, Androids Navigationsleiste, der Immersive-Modus und der Home-Indikator von iOS.
Rendere sie so lange, wie sie gelten soll, oder gib jeder Route ihre eigene.

```tsx
import { Route, Router, SystemBars } from 'kuito';

function Gallery() {
  return (
    <>
      <SystemBars
        statusBar={{ content: 'light' }}
        backgroundColor="#101014"
        navigationBarColor="#4b2a8a"
        navigationBarButtonStyle="light"
      />
      <Photos />
    </>
  );
}

<Router>
  <Route path="/" screen={Home} />
  <Route
    path="/photo/:id"
    screen={Photo}
    systemBars={{ statusBar: { content: 'light', hidden: true } }}
  />
</Router>;
```

| Prop                       | iOS                                                                                                 | Android                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `statusBar`                | die Statusleiste, [siehe unten](#the-status-bar)                                                    | die Statusleiste, [siehe unten](#the-status-bar)               |
| `backgroundColor`          | die View des Root-View-Controllers                                                                  | die Decor-View des Fensters                                    |
| `navigationBarColor`       | keine Navigationsleiste: keine Wirkung                                                              | eine View hinter der Navigationsleiste, so hoch wie ihr Inset  |
| `navigationBarButtonStyle` | keine Wirkung                                                                                       | `light`-Buttons für eine dunkle Leiste, `dark` für eine helle  |
| `navigationBarHidden`      | keine Wirkung                                                                                       | blendet die Leiste aus; ein Wischen vom Rand zeigt sie kurz an |
| `immersive`                | blendet die Statusleiste aus, blendet den Home-Indikator automatisch aus, verzögert Randwischgesten | blendet die Status- und die Navigationsleiste aus              |
| `homeIndicatorAutoHidden`  | der Home-Indikator verblasst, solange der Bildschirm nicht berührt wird                             | kein Home-Indikator: keine Wirkung                             |

Ein Prop, das Chrome benennt, das eine Plattform nicht hat, bewirkt dort nichts, sodass
App-Code keine Plattformprüfungen braucht. Farben sind CSS-Hex (`#rgb`, `#rgba`, `#rrggbb`,
`#rrggbbaa`) oder `transparent`; alles andere ist ein `TypeError`, wenn die Komponente rendert.

## Die Statusleiste

`statusBar` nimmt die eigenen Props der Statusleiste entgegen:

| Prop              | Werte                                           | Plattformen                   |
| ----------------- | ----------------------------------------------- | ----------------------------- |
| `content`         | `auto`, `light`, `dark`                         | beide                         |
| `hidden`          | Boolean                                         | beide                         |
| `animated`        | animiert `content`, `hidden`, `backgroundColor` | beide                         |
| `transition`      | `fade` (Standard), `slide`, `none`              | iOS; Android hat seine eigene |
| `backgroundColor` | eine Hex-Farbe oder `transparent`               | Android; auf iOS ignoriert    |
| `translucent`     | true (Standard) oder false                      | Android; auf iOS ignoriert    |

`auto` ist der Stil, mit dem die App gestartet ist: `statusBar.style` in kuito.config.ts,
ohne Angabe `auto`, also dunkler Text im hellen Modus und heller Text im dunklen Modus, auf
beiden Plattformen. `SystemBars.statusBarHeight` ist die Höhe der Statusleiste in dp auf
Android, synchron gelesen; null auf iOS.

## Der Stack

Jede gemountete `<SystemBars>` ist ein Eintrag in einem Stack. Der letzte Eintrag, der ein
Prop setzt, gewinnt dieses Prop, jedes Prop von `statusBar` für sich, und ein ausgelassenes
oder `undefined` Prop setzt nichts. Das Unmounten eines Eintrags gibt seine Props an die
darunterliegenden zurück, mit dem `animated` des Eintrags, der sie gesetzt hat, bis hinunter
zu den eigenen der Shell: ihre Root-Farbe und die Statusleiste des Starts, eine transparente
Navigationsleiste mit den Buttons des Themes, nichts ausgeblendet. Eine `<SystemBars>`, deren
Props sich ändern, behält ihren Platz. Gemeinsam vorgenommene Änderungen, etwa das Mounten der
SystemBars eines Screens, gehen einmal zur Plattform über, und nur das, was sich von dem
unterscheidet, was sie zeigt.

`immersive` ist das, was es ausblendet: die Statusleiste, die Navigationsleiste und den
Home-Indikator, als setzte der Eintrag `statusBar.hidden` (animiert), `navigationBarHidden`
und `homeIndicatorAutoHidden`. Die eigenen Props des Eintrags gewinnen über diese, ebenso
jeder danach gemountete Eintrag: eine nach einer immersiven gemountete
`<SystemBars statusBar={{ hidden: false }} />` zeigt die Statusleiste. Auf iOS verzögert es
außerdem Randwischgesten, sodass das erste Wischen die App erreicht. `immersive={false}` setzt
nichts, wie ein ausgelassenes Prop.

Es gibt keine imperativen Setter: Sie würden den Stack umgehen, und der Scope der Komponente
sagt bereits, wie lange ein Stil gilt. Der Stack überlebt einen Live Patch: Gemountete
SystemBars behalten ihre Einträge, wenn das Bundle der App erneut läuft. Ein Neuladen gibt
jede Leiste an die Shell zurück.

## Pro Screen

Das `systemBars` einer `<Route>` nimmt die Props einer `<SystemBars>` entgegen und wendet sie
an, solange ihr Screen den Fokus hat: das oberste Sheet oder die Spitze des Stacks des
ausgewählten Tabs ([Navigation](navigation.md)). Der Router schiebt diesen Eintrag an die
Spitze des Stacks, bevor der fokussierte Screen rendert, sodass er über SystemBars gewinnt,
die vor dem Erscheinen des Screens gemountet wurden, und die eigenen `<SystemBars>`-Elemente
des Screens weiterhin über ihn gewinnen. Zurückgehen stellt den Screen darunter wieder her.

Eine in einem Screen gerenderte `<SystemBars>` zählt, solange der Screen gemountet ist:
Screens weiter unten in einem Stack und andere Tabs bleiben gemountet, und ihre SystemBars
bleiben im Stack, unter den neueren. Für Leisten pro Tab nimm die Option `systemBars` der
Routen.

Die Root-View ist dort sichtbar, wo die Views der App sie nicht bedecken: hinter einem Screen,
der das Fenster nicht ausfüllt, oder bei einem Übergang. Die Screens eines Navigationsstacks
sind deckend.

## Wie es verdrahtet ist

`SystemBars` steuert das native Modul `SystemUI`. Auf iOS liegt der Zustand in
`KuitoSystemBars`, das der Root-View-Controller der Shell für `preferredStatusBarStyle`,
`prefersStatusBarHidden`, `preferredStatusBarUpdateAnimation`,
`prefersHomeIndicatorAutoHidden` und `preferredScreenEdgesDeferringSystemGestures` liest
(View-Controller-basierte Darstellung der Statusleiste); die Shell initialisiert ihn mit dem
Startstil aus kuito.config.ts. Der Stack beginnt mit dem `hidden` des Starts, synchron
gelesen, sodass das Zurückgeben von `hidden` die konfigurierte Statusleiste wiederherstellt.
Dieser Zustand gehört der Shell (`KuitoSystemBars`, in `native/ios/App/Shell`), die der
Root-View-Controller liest, sodass eine Shell ohne `SystemUI` die konfigurierten Leisten
behält.

Auf Android setzt `WindowInsetsControllerCompat` die Symbole und die Sichtbarkeit, und ein
Wischen vom Rand zeigt ausgeblendete Leisten kurz an. Android 15 zeichnet jede App von Rand zu
Rand und ignoriert `Window.statusBarColor` und `Window.navigationBarColor`, daher ist die
Farbe jeder Leiste eine View in der Decor-View, auf das Inset dieser Leiste bemessen, auf
jeder Version gleich. `statusBar.translucent: false` rückt den Inhalt stattdessen unter die
Statusleiste, sodass eine `SafeArea` dort kein oberes Inset bekommt. Bei
Drei-Tasten-Navigation zeichnet das System einen eigenen Scrim; eine Navigationsleistenfarbe
außer transparent schaltet ihn ab.

iOS 13 hat die Netzwerkaktivitätsanzeige entfernt, daher gibt es kein Prop dafür.
