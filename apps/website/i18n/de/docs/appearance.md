# appearance

Der Hell- oder Dunkelmodus und die Textgröße des Benutzers, als Signale.

```tsx
import { Text, watch, appearance } from 'kuito';

appearance.colorScheme.value; // 'light' | 'dark' | null
appearance.fontScale.value; // 1 by default

// In a component, a read in JSX or a watch follows the platform.
<Text>{appearance.colorScheme.value === 'dark' ? 'Night' : 'Day'}</Text>;
watch(appearance.fontScale, (scale) => console.log(scale));
```

Beide werden synchron gelesen, und die Plattform wird nur beobachtet, solange
etwas eines von ihnen beobachtet. `colorScheme` ist CSS'
`prefers-color-scheme`: `null`, wenn die Plattform keine Präferenz hat. Die Schriftskalierung
sitzt hier, bei der anderen Anzeigepräferenz.

| Schriftskalierung | iOS                                                                                                                                                    | Android                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| Quelle            | Die Dynamic-Type-Größe, auf die Multiplikatoren von React Native abgebildet (`large` 1, `extraLarge` 1.118, `accessibilityExtraExtraExtraLarge` 3.571) | `Configuration.fontScale` |
| Änderung          | Aktualisiert das Signal                                                                                                                                | Aktualisiert das Signal   |

Der Dunkelmodus aktualisiert `colorScheme` auf beiden. Auf Android behandelt das Manifest `uiMode`
und `fontScale` (zusammen mit Rotation und Fenstergrößenänderungen), sodass die Activity nicht
neu erzeugt wird und die App ihren Zustand behält. Android-Textgrößen sind in Pixeln
festgelegt, sobald sie gesetzt werden, daher setzt der Renderer bei einer Änderung der Schriftskalierung
die Größe jedes Textes erneut: jeder wird so groß, wie er in einer App wäre, die mit
der neuen Skalierung gestartet wurde, einschließlich des geringeren Wachstums für großen Text in Android 14.

## Wie es verdrahtet ist

UIKit hat keine Benachrichtigung für eine Änderung von `userInterfaceStyle`, daher meldet die iOS-Shell
die Traits ihrer Szene an `KuitoTraits`
(`native/modules/appearance/ios`, sodass das Modul in seiner Spezifikation `always`
ist): bei der Verbindung, aus
`windowScene(_:didUpdate:interfaceOrientation:traitCollection:)` und wenn
die Szene aktiv wird. Während die App im Hintergrund ist, schaltet iOS den
Stil um, um beide Erscheinungsbilder als Snapshot aufzunehmen; die Shell meldet diese nicht und
holt bei der Rückkehr auf. Android liest die Konfiguration und hört mit
`registerComponentCallbacks` zu.
