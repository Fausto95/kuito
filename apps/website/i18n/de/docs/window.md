# window

Das Fenster der App als Signale: seine Größe, die Insets der Safe Area und seine
Ausrichtung, in Punkten auf iOS und dp auf Android.

```tsx
import { Text, window } from 'kuito';

<Text>{`${window.size.value.width} × ${window.size.value.height}`}</Text>;
<Text>{window.orientation.value === 'landscape' ? 'Wide' : 'Tall'}</Text>;
window.insets.value; // { top, left, bottom, right }
```

| Signal        | Ist                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `size`        | `{ width, height }`: dasselbe Objekt, solange die Größe gleich bleibt.                                                                               |
| `insets`      | Wie weit die Statusleiste, die Notch, der Home-Indikator und die Navigationsleiste hineinreichen.                                                    |
| `orientation` | `'landscape'`, wenn das Fenster breiter als hoch ist, andernfalls `'portrait'`.                                                                      |
| `widthClass`  | `'compact'` unter 600 Breite, `'medium'` unter 840, `'expanded'` darüber; dem folgt `@media (width-class: …)` ([Bedingungen](styles.md#conditions)). |

Alle drei werden synchron gelesen. Ein Lesen in JSX oder ein `watch` folgt ihnen, und
das Modul gibt Änderungen nur aus, solange etwas eines davon beobachtet. Für das Auffüllen um die
Safe Area erledigt `SafeArea` das nativ und braucht nichts davon: die Signale sind
für Layout-Entscheidungen gedacht, die JavaScript trifft, etwa eine Spaltenanzahl.

## Wie es verdrahtet ist

Die Shell meldet ihr Fenster an `KuitoWindowMetrics` (`native/modules/window`,
`always` in seiner Spezifikation) nach jedem Layout, dem einen Moment, in dem die Größe und die
Insets nach einer Rotation, einer Größenänderung oder einer Änderung der Leisten beide aktuell sind:

- iOS: `layoutSubviews` und `safeAreaInsetsDidChange` des Fensters, mit
  `bounds` und `safeAreaInsets`.
- Android: ein globaler Layout-Listener auf der Root-View der Activity, mit ihrer Größe
  und den Root-Window-Insets der Systemleisten und des Display-Cutouts.

`KuitoWindowMetrics` hält die letzten Metriken unter einem Lock (iOS) oder in einem
volatilen Feld (Android), sodass der JS-Thread sie liest, ohne auf den
Hauptthread zu warten, und meldet nur eine Änderung.
