# fonts

`fontFamily` benennt eine Systemfamilie, eine Schrift, die die App bündelt,
oder eine, die sie zur Laufzeit lädt. `fontWeight` und `fontStyle` wählen
unter den Dateien der Familie, wie CSS es tut. Eine Familie, die nichts davon
ist, ist ein Fehler, der sie benennt, nie ein stiller Rückfall auf die
Systemschrift.

```tsx
<Text fontFamily="Pacifico">Bundled</Text>
<Text fontFamily="Lato" fontWeight="bold">Loaded at run time</Text>
```

## Schriften bündeln

.ttf- und .otf-Dateien unter `fonts` in `kuito.config.ts` auflisten, relativ
dazu:

```ts
export default {
  // …
  fonts: [
    './assets/fonts/Pacifico-Regular.ttf',
    './assets/fonts/Lato-Regular.ttf',
    './assets/fonts/Lato-Bold.ttf',
    // A file whose own tables name its face wrongly:
    { file: './assets/fonts/LatoHeavy.otf', family: 'Lato', weight: 900, style: 'italic' },
  ],
  environments: {
    staging: { fonts: ['./assets/fonts/Staging.ttf'] },
  },
} satisfies KuitoConfig;
```

Familie, Stärke und Stil jeder Datei stammen aus der Datei selbst: ihrer
typografischen Familie (Name-ID 16, sonst die Familie, ID 1), ihrer
OS/2-Weight-Klasse und dem Italic-Bit von OS/2. So sind `Lato-Regular.ttf` und
`Lato-Bold.ttf` beide `Lato`, bei 400 und 700, und `fontFamily: 'Lato'` mit
`fontWeight: 'bold'` zeichnet die fette Datei. Ein Objekt setzt stattdessen
beliebige von `family`, `weight` (`normal`, `bold` oder `100`–`900`) und
`style` (`normal` oder `italic`).

Die `fonts` einer Umgebung ersetzen die gesamte Liste. Die CLI prüft die Liste
jeder Umgebung: Ein Pfad, der nicht .ttf oder .otf ist, ein ihr unbekannter
Font-Schlüssel, zwei Dateien mit einem Namen, eine Datei, die keine einzelne
TrueType- oder OpenType-Schrift ist (eine `.ttc`-Sammlung ist ein Fehler),
und zwei Dateien mit derselben Familie, Stärke und demselben Stil schlagen
jeweils fehl und nennen den Schlüssel.

Bei jedem Build (`src/cli/fonts.ts`) gehen die Dateien und ein Manifest,
`fonts.json`, mit dem Schnitt jeder Datei in die Shells:

- **iOS**: `.kuito/ios/fonts/`, ein Ordner im App-Bundle, wobei jede Datei
  in `UIAppFonts` aufgeführt ist, damit iOS sie beim Start registriert.
- **Android**: `.kuito/android/assets/fonts/`, geladen mit
  `Typeface.createFromAsset`.

## Schriften zur Laufzeit laden

`fonts.load` registriert Schriftdateien, die die App auf der Festplatte hat,
typischerweise solche, die sie mit [fileSystem](file-system.md)
heruntergeladen hat. Jeder Schlüssel ist die Familie, die `fontFamily`
verwenden wird; eine Datei ohne Stärke oder Stil ist 400 und normal.

```tsx
import { fileSystem, fonts } from 'kuito';

const regular = fileSystem.cache + 'Lato-Regular.ttf';
const bold = fileSystem.cache + 'Lato-Bold.ttf';

await fileSystem.download(LATO_REGULAR_URL, regular);
await fileSystem.download(LATO_BOLD_URL, bold);
await fonts.load({ Lato: [regular, { uri: bold, weight: 'bold' }] });

fonts.loaded('Lato'); // true: bundled or loaded
```

| Funktion         | Läuft auf                         | Hinweise                                                   |
| ---------------- | --------------------------------- | ---------------------------------------------------------- |
| `load(fonts)`    | dem Hintergrund-Thread des Moduls | `{ Family: uri \| { uri, weight, style } \| [...] }`       |
| `loaded(family)` | dem JS-Thread, synchron           | ob eine gebündelte oder geladene Schrift diese Familie hat |

URIs müssen `file://` sein; eine entfernte URL, eine leere Familie, eine leere
Liste oder eine Stärke oder ein Stil außerhalb der obigen ist ein
`TypeError`, bevor irgendetwas die Grenze überquert. Eine Datei, die die
Plattform nicht laden kann, weist mit `ERR_FONT` zurück, eine fehlende mit
`ERR_NOT_FOUND`.

iOS registriert jede Datei für den Prozess mit
`CTFontManagerRegisterFontsForURL`; Android erzeugt ein `Typeface` mit
`Typeface.createFromFile`. Eine Registrierung hält, bis die App beendet wird,
über Reloads hinweg. Das erneute Laden von Stärke und Stil einer Familie
ersetzt diesen Schnitt. `load` abwarten, bevor Text in der Familie gerendert
wird: Bis dahin fehlt die Familie.

## Wie `fontFamily` aufgelöst wird

Jeder Renderer hält eine Registry von Familien (`KuitoFonts` auf beiden
Plattformen): das gebündelte Manifest, bei der ersten Verwendung gelesen, plus
das, was `fonts.load` hinzugefügt hat. Für eine darin enthaltene Familie wird
der Schnitt so gewählt, wie CSS Fonts 4 Schriften zuordnet:

1. **Stil**: die Schnitte des angeforderten `fontStyle`, oder alle, wenn die
   Familie keinen in diesem Stil hat. Nichts wird synthetisch kursiv gestellt
   oder fett gemacht.
2. **Stärke**: die angeforderte `fontWeight`, wenn die Familie sie hat.
   Andernfalls, für 400 und 500, schwerere Schnitte bis 500, dann leichtere,
   dann schwerere; für leichtere Stärken zuerst leichtere Schnitte; für
   schwerere Stärken zuerst schwerere Schnitte. So zeichnet eine Familie aus
   400 und 700 `fontWeight: 600` fett und `300` regular.

Eine Familie, die die Registry nicht hat, fällt auf das System durch: jede
Familie oder jeder Schriftname, den iOS kennt (`Menlo`, `Georgia-Bold`), oder
eine Systemfamilie auf Android (`serif`, `monospace`,
`sans-serif-condensed`), vom System wie bisher gewichtet und kursiv gestellt.
Alles andere schlägt an der Prop fehl:

```text
Unsupported: UILabel.fontFamily: no font family "Inter": bundle it with fonts in kuito.config.ts or load it with fonts.load (docs/fonts.md)
```

Variable Schriften zeichnen ihre Standardinstanz; ihre Achsen sind noch nicht
auf `fontWeight` abgebildet.
