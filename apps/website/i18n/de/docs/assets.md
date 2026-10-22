# Assets und Symbole

Bilder, die mit der App ausgeliefert werden, werden importiert, nicht per URL
geladen: Der Compiler bündelt jedes davon in beide Shells und macht aus dem
Import eine Quelle, deren Größe er bereits kennt. Die plattformeigenen Symbole
sind ein Primitiv, `<Symbol>`, dessen Name beim Kompilieren der App geprüft
wird.

```tsx
import { Image, Symbol } from 'kuito';
import cover from './assets/cover.png';

<Image src={cover} />
<Symbol name="star" size={18} weight="semibold" tintColor="#f5c451" />
```

## Gebündelte Bilder

`import cover from './cover.png'` macht `cover` zu einer `BundledImageSource`,
`{ asset, width, height }`, die `<Image src>` wie eine URL entgegennimmt. Apps
typisieren den Import über `kuito/src/ui/assets.d.ts`, das die `tsconfig.json`
einer neuen App einbindet.

| Datei          | iOS                                 | Android                                         |
| -------------- | ----------------------------------- | ----------------------------------------------- |
| `.png`, `.jpg` | ein Image Set seiner Skalierungen   | `drawable-mdpi`, `-xhdpi`, `-xxhdpi`            |
| `.svg`         | das SVG, als Vektor gezeichnet      | ein VectorDrawable, beim Build konvertiert      |
| `.pdf`         | die erste Seite des PDF, als Vektor | seine erste Seite, gezeichnet von `PdfRenderer` |

- **Skalierungen.** `cover@2x.png` und `cover@3x.png` neben `cover.png` sind
  dasselbe Bild in 2× und 3×; jede Plattform wählt das passende für den
  Bildschirm. Der Import benennt die einfache Datei, die selbst fehlen darf.
- **Größe.** Der Compiler liest die Größe in Punkten aus der Datei: die Pixel
  eines Rasterbilds geteilt durch seine größte Skalierung, `width` und `height`
  eines SVG (sonst seine `viewBox`), die Seite eines PDF. Ein Image einer
  gebündelten Quelle ohne `width`, `height` oder eine Klasse, die es
  dimensioniert, hat diese Größe; mit einer Seite angegeben behält es das
  Seitenverhältnis des Bildes. Eine von der App angegebene Größe gewinnt immer.
- **Namen.** Beide Shells kennen ein Bild unter seinem Pfad ab dem Wurzelverzeichnis
  der App (dem Verzeichnis mit `kuito.config.ts`), als Android-Ressourcenname:
  `assets/Cover Art.png` ist `asset_assets_cover_art`. Zwei Dateien, die auf
  denselben Namen kommen, sind ein Kompilierfehler, der beide benennt.
- **Fehlende Dateien.** Ein Import eines Bildes, das in keiner Skalierung
  existiert, ist ein Kompilierfehler am Import, wie jeder nicht auflösbare
  Import: Das Umbenennen eines Bildes bricht den Build dort, wo es verwendet
  wird, nicht auf einem Gerät.
- **Vektoren.** iOS behält SVG und PDF als Vektoren, sodass sie in jeder Größe
  scharf bleiben. Android zeichnet Vektoren in seinem eigenen XML-Format, das
  abdeckt, woraus Icons bestehen: Pfade, Rechtecke, Kreise, Ellipsen, Linien,
  Polylinien und Polygone; Gruppen mit `translate`-, `scale`-, `rotate`- und
  nicht scherenden `matrix`-Transformationen; einfarbige Füllungen und Konturen
  mit ihrer Deckkraft, Linienenden, Verbindungen und `fill-rule`. Alles andere
  (Text, Verläufe, `<style>`-Blätter, Clip-Pfade, Masken, Filter, eingebettete
  Bilder, `<use>`) lässt den Android-Build mit Nennung des Elements
  fehlschlagen; bündeln Sie stattdessen ein PNG oder PDF davon. Ein PDF wird auf
  beiden Plattformen in der Größe neu gezeichnet, in der es erscheint.

### Live Patch

Ein importiertes Bild wird wie eine Quelldatei überwacht. Das Bearbeiten eines
Bildes kompiliert die App neu und sendet den Patch; `kuito dev` erkennt, dass
die laufende Shell mit anderen Bytes oder ganz ohne das Bild gebaut wurde, und
meldet dies in seinem Feed (`Rebuilding the shell: the app now bundles
assets/cover.png`), während es die Shell neu baut und neu startet, so wie bei
einem neu benötigten nativen Modul. Eine `@2x`-Datei, die neben ein Bild gelegt
wird, wird bei der nächsten Bearbeitung seines Importeurs aufgenommen.

Auf dem Gerät ist ein Image, dessen gebündelten Namen die Shell nicht kennt, ein
ungültiges Prop (`The app was built without the image …: build it again`),
niemals eine leere View.

## Symbole

`<Symbol>` zeichnet das plattformeigene Symbol: ein
[SF Symbol](https://developer.apple.com/sf-symbols/) auf iOS, ein
[Material Symbol](https://fonts.google.com/icons) auf Android, so wie es
Tab-Icons tun ([Navigation](navigation.md#icons)).

| Prop        | Bedeutung                                                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `name`      | Ein Name, den beide Plattformen haben, wie `"star"`, oder `{ ios, android }`, da sich die meisten unterscheiden.                          |
| `size`      | Punktgröße; standardmäßig 24. Die View ist ein Quadrat dieser Größe, sofern die App sie nicht dimensioniert, und das Symbol passt hinein. |
| `weight`    | `ultralight`, `thin`, `light`, `regular` (Standard), `medium`, `semibold`, `bold`, `heavy`, `black`.                                      |
| `tintColor` | Die Farbe des Symbols; standardmäßig schwarz, wie bei Text.                                                                               |

```tsx
<Symbol name={{ ios: 'square.and.arrow.up', android: 'share' }} size={20} />
```

Ein literaler Name, den eine Plattform nicht kennt, lässt die Kompilierung an
seiner Zeile fehlschlagen, für `<Symbol name>` und `<Tab icon>` gleichermaßen:

```
app/home.tsx:12:20 <Symbol name="magnifyingglass">: no Material Symbol has that name (fonts.google.com/icons)
```

Der Compiler liest die iOS-Namen aus den SF Symbols, die der Mac auflistet,
sodass ein iOS-Name geprüft wird, wenn die App auf einem Mac kompiliert wird
(wie es ein iOS-Build muss), und die Android-Namen aus der
Material-Symbols-Schrift, mit der die Android-Shell zeichnet. Ein zur Laufzeit
berechneter Name wird stattdessen vom Renderer geprüft, der einen ihm
unbekannten Namen als ungültiges Prop meldet.

Die Material-Symbols-Schrift von Android hat nur eine Strichstärke, sodass
`medium` und schwerere Stärken die Kontur fetten und leichtere Stärken regulär
zeichnen; iOS zeichnet jede SF-Symbols-Strichstärke.
