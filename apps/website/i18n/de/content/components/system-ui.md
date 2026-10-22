# SystemBars

`SystemBars` deklariert das System-Chrome rund um die App, solange es gemountet ist: die Statusleiste, die Farbe der Root-View, die Navigationsleiste von Android, den immersiven Modus und den Home-Indikator von iOS. Es dort rendern, wo ein Screen eigene Leisten braucht, oder einer Route `systemBars` geben.

Geeignet für:

- hellen Statusleisteninhalt über einem dunklen Screen;
- ein Foto oder Video im Vollbild mit ausgeblendeten Leisten;
- die Navigationsleiste von Android in der Farbe der App.

```tsx
import { SystemBars, Text, VStack } from 'kuito';

export default function Gallery() {
  return (
    <>
      <SystemBars
        statusBar={{ content: 'light' }}
        backgroundColor="#101014"
        navigationBarColor="#101014"
        navigationBarButtonStyle="light"
      />
      <VStack flex={1} backgroundColor="#101014">
        <Text color="#ffffff">Photos</Text>
      </VStack>
    </>
  );
}
```

Jedes gemountete SystemBars ist ein Eintrag in einem einzigen Stack: Der letzte, der eine Prop setzt, gewinnt sie, jede Prop von `statusBar` für sich, und eine weggelassene Prop setzt nichts. Beim Unmounten gehen seine Props an die Einträge darunter zurück, bis hinunter zu denen der Shell. Farben sind CSS-Hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) oder `transparent`; alles andere ist beim Rendern ein `TypeError`.

## Muster

### Die Leisten pro Screen festlegen

`systemBars` einer `Route` nimmt die Props von SystemBars an und wendet sie an, solange ihr Screen fokussiert ist. Zurückgehen stellt den Screen darunter wieder her.

```tsx
import { Route, Router, Text } from 'kuito';

function Home() {
  return <Text padding={16}>Home</Text>;
}

function Photo() {
  return <Text padding={16}>Photo</Text>;
}

export default function App() {
  return (
    <Router>
      <Route name="index" path="/" screen={Home} />
      <Route
        name="photo"
        path="/photo"
        screen={Photo}
        systemBars={{ statusBar: { content: 'light', hidden: true } }}
      />
    </Router>
  );
}
```

Screens weiter unten in einem Stack und andere Tabs bleiben gemountet, also bleibt auch ein darin gerendertes SystemBars im Stack: Für Leisten pro Tab das `systemBars` der Routen verwenden.

### Ins Vollbild gehen

`immersive` blendet die Statusleiste und die Navigationsleiste aus, lässt den Home-Indikator von iOS ausblenden und lässt auf iOS die erste Wischgeste vom Rand bei der App ankommen. Ein danach gemounteter Eintrag gewinnt gegenüber dem, was es ausblendet.

```tsx
import { Button, Show, SystemBars, VStack, Video, signal } from 'kuito';

export default function Player() {
  const fullScreen = signal(false);

  return (
    <VStack flex={1}>
      <Show when={fullScreen.value}>
        <SystemBars immersive />
      </Show>
      <Video src={{ uri: 'https://example.com/film.m3u8' }} flex={1} />
      <Button onPress={() => (fullScreen.value = !fullScreen.value)}>Full screen</Button>
    </VStack>
  );
}
```

### Die Statusleiste animieren

`animated` animiert Änderungen an `content`, `hidden` und dem `backgroundColor` von Android; `transition` wählt, wie iOS sie ein- und ausblendet.

```tsx
import { Button, SystemBars, VStack, signal } from 'kuito';

export default function Reader() {
  const reading = signal(false);

  return (
    <VStack flex={1}>
      <SystemBars statusBar={{ hidden: reading.value, animated: true, transition: 'slide' }} />
      <Button onPress={() => (reading.value = !reading.value)}>Focus</Button>
    </VStack>
  );
}
```

### Unter der Statusleiste layouten auf Android

`SystemBars.statusBarHeight` ist die Höhe der Statusleiste in dp auf Android, synchron gelesen, und null auf iOS.

```tsx
import { Box, SystemBars } from 'kuito';

export default function Header() {
  return <Box height={56 + (SystemBars.statusBarHeight ?? 0)} backgroundColor="#5b5bd6" />;
}
```

## Plattformunterschiede

Eine Prop für Chrome, das eine Plattform nicht hat, bewirkt dort nichts, also braucht App-Code keine Plattformprüfungen.

| Prop                                                                    | iOS                                                                                                          | Android                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `statusBar.content`, `statusBar.hidden`                                 | Ja                                                                                                           | Ja                                        |
| `statusBar.transition`                                                  | `fade` (Standard), `slide`, `none`                                                                           | Eigene                                    |
| `statusBar.backgroundColor`, `statusBar.translucent`                    | Keine Wirkung                                                                                                | Ja                                        |
| `navigationBarColor`, `navigationBarButtonStyle`, `navigationBarHidden` | Keine Wirkung                                                                                                | Ja                                        |
| `homeIndicatorAutoHidden`                                               | Ja                                                                                                           | Keine Wirkung                             |
| `immersive`                                                             | Blendet die Statusleiste aus, blendet den Home-Indikator automatisch aus, stellt Wischgesten vom Rand zurück | Blendet Status- und Navigationsleiste aus |

`statusBar.content: 'auto'` ist der Stil, mit dem die App gestartet ist: `statusBar.style` in `kuito.config.ts`, also dunkler Text im hellen Modus und heller Text im dunklen Modus, sofern nicht gesetzt.

## Siehe auch

- [SafeArea](./safe-area.md)
- [Router](./router.md)
- [Appearance](../../../../docs/appearance.md)
- [SystemBars im Detail](../../../../docs/system-ui.md)
