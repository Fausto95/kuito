# Schriften

`fontFamily` benennt eine Systemfamilie, eine Schrift, die die App bündelt, oder eine, die sie zur Laufzeit lädt. `fontWeight` und `fontStyle` wählen unter den Dateien der Familie, wie CSS es tut. Eine Familie, die keines davon ist, ist ein Fehler, der sie nennt, nie ein stiller Rückfall auf die Systemschrift.

```tsx
<Text fontFamily="Pacifico">Bundled</Text>
<Text fontFamily="Lato" fontWeight="bold">Loaded at run time</Text>
```

## Schriften bündeln

.ttf- und .otf-Dateien unter `fonts` in `kuito.config.ts` auflisten, relativ dazu:

```ts
export default {
  // ...
  fonts: [
    './assets/fonts/Pacifico-Regular.ttf',
    './assets/fonts/Lato-Regular.ttf',
    './assets/fonts/Lato-Bold.ttf',
    // A file whose own tables name its face wrongly:
    { file: './assets/fonts/LatoHeavy.otf', family: 'Lato', weight: 900, style: 'italic' },
  ],
} satisfies KuitoConfig;
```

Familie, Stärke und Stil jeder Datei stammen aus der Datei selbst. So sind `Lato-Regular.ttf` und `Lato-Bold.ttf` beide `Lato`, mit 400 und 700, und `fontFamily: 'Lato'` mit `fontWeight: 'bold'` zeichnet die fette Datei. Ein Objekt setzt stattdessen beliebige von `family`, `weight` (`normal`, `bold` oder `100`-`900`) und `style` (`normal` oder `italic`).

Die `fonts` einer Umgebung ersetzt die ganze Liste. Die CLI prüft die Liste jeder Umgebung: ein Pfad, der nicht .ttf oder .otf ist, zwei Dateien mit einem Namen, eine `.ttc`-Sammlung und zwei Dateien derselben Familie, Stärke und desselben Stils schlagen jeweils fehl und nennen den Schlüssel.

## Schriften zur Laufzeit laden

`fonts.load` registriert Schriftdateien, die die App auf der Festplatte hat, typischerweise mit [fileSystem](../../../../docs/file-system.md) heruntergeladene. Jeder Schlüssel ist die Familie, die `fontFamily` verwenden wird; eine Datei ohne Stärke oder Stil ist 400 und normal.

```tsx
import { fileSystem, fonts } from 'kuito';

const regular = fileSystem.cache + 'Lato-Regular.ttf';
const bold = fileSystem.cache + 'Lato-Bold.ttf';

await fileSystem.download(LATO_REGULAR_URL, regular);
await fileSystem.download(LATO_BOLD_URL, bold);
await fonts.load({ Lato: [regular, { uri: bold, weight: 'bold' }] });

fonts.loaded('Lato'); // true: bundled or loaded
```

URIs müssen `file://` sein; eine entfernte URL, eine leere Familie, eine leere Liste oder eine Stärke oder ein Stil außerhalb der obigen ist ein `TypeError`. Eine Datei, die die Plattform nicht laden kann, wird mit `ERR_FONT` abgelehnt, eine fehlende mit `ERR_NOT_FOUND`. Eine Registrierung hält bis zum Beenden der App, über Reloads hinweg. Stärke und Stil einer Familie erneut zu laden ersetzt diesen Schnitt. `load` vor dem Rendern von Text in der Familie abwarten: bis dahin fehlt die Familie.

## Wie fontFamily aufgelöst wird

Für eine gebündelte oder geladene Familie wird der Schnitt so gewählt, wie CSS Fonts 4 Schriften abgleicht:

1. Stil: die Schnitte des angeforderten `fontStyle`, oder alle, wenn die Familie keinen in diesem Stil hat. Nichts wird synthetisch geneigt oder verstärkt.
2. Stärke: das angeforderte `fontWeight`, wenn die Familie es hat. Sonst, für leichtere Stärken, zuerst leichtere Schnitte; für schwerere Stärken, zuerst schwerere Schnitte. Eine Familie aus 400 und 700 zeichnet `fontWeight: 600` also fett und `300` regular.

Eine Familie, die die Registry nicht hat, fällt zum System durch: jede Familie oder jeder Schriftname, den iOS kennt (`Menlo`, `Georgia-Bold`), oder eine Systemfamilie auf Android (`serif`, `monospace`, `sans-serif-condensed`). Alles andere schlägt an der Prop fehl:

```text
Unsupported: UILabel.fontFamily: no font family "Inter": bundle it with fonts in kuito.config.ts or load it with fonts.load (docs/fonts.md)
```

Variable Schriften zeichnen ihre Standardinstanz; ihre Achsen sind noch nicht auf `fontWeight` abgebildet.

## Vertiefung

[Schriften](../../../../docs/fonts.md) behandelt, wie der Schnitt einer Datei aus ihren Tabellen gelesen wird, wo gebündelte Dateien in jeder Shell landen, auf welchem Thread `load` und `loaded` laufen, und die vollständige Reihenfolge des Stärkenabgleichs.
