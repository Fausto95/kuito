# Assets und Symbole

Bilder, die mit der App ausgeliefert werden, werden importiert, nicht per URL geladen: der Compiler bündelt jedes in beide Shells und macht aus dem Import eine Quelle, deren Größe er bereits kennt. Die eigenen Symbole der Plattformen sind ein Primitiv, `<Symbol>`, beim Kompilieren der App nach Namen geprüft.

```tsx
import { Image, Symbol } from 'kuito';
import cover from './assets/cover.png';

<Image src={cover} />
<Symbol name="star" size={18} weight="semibold" tintColor="#f5c451" />
```

## Gebündelte Bilder

`import cover from './cover.png'` macht `cover` zu einer `BundledImageSource`, `{ asset, width, height }`, die `<Image src>` wie eine URL nimmt. Apps typisieren den Import über `kuito/src/ui/assets.d.ts`, das die `tsconfig.json` einer neuen App einbindet.

| Datei          | iOS                                 | Android                                         |
| -------------- | ----------------------------------- | ----------------------------------------------- |
| `.png`, `.jpg` | ein Image Set seiner Skalierungen   | `drawable-mdpi`, `-xhdpi`, `-xxhdpi`            |
| `.svg`         | das SVG, als Vektor gezeichnet      | ein VectorDrawable, beim Build konvertiert      |
| `.pdf`         | die erste Seite des PDF, als Vektor | seine erste Seite, von `PdfRenderer` gezeichnet |

- **Skalierungen.** `cover@2x.png` und `cover@3x.png` neben `cover.png` sind dasselbe Bild in 2x und 3x; jede Plattform wählt das für den Bildschirm.
- **Größe.** Der Compiler liest die Größe in Punkten aus der Datei. Ein Image einer gebündelten Quelle ohne `width`, `height` oder eine Klasse, die es dimensioniert, hat diese Größe; mit einer Seite behält es das Seitenverhältnis des Bildes. Eine Größe, die die App angibt, gewinnt immer.
- **Fehlende Dateien.** Ein Import eines Bildes, das nicht existiert, in irgendeiner Skalierung, ist ein Kompilierfehler am Import: ein Bild umzubenennen bricht den Build dort, wo es verwendet wird, nicht auf einem Gerät.

## Vektoren

iOS behält SVG und PDF als Vektoren, sodass sie in jeder Größe scharf bleiben. Android zeichnet Vektoren in seinem eigenen XML-Format, das abdeckt, woraus Icons bestehen: Pfade, Rechtecke, Kreise, Ellipsen, Linien, Polylinien und Polygone; Gruppen mit `translate`-, `scale`-, `rotate`- und scherungsfreien `matrix`-Transformationen; einfarbige Füllungen und Konturen. Alles andere (Text, Verläufe, `<style>`-Sheets, Clip-Pfade, Masken, Filter, eingebettete Bilder, `<use>`) lässt den Android-Build fehlschlagen und nennt das Element; stattdessen ein PNG oder PDF davon bündeln.

## Symbole

`<Symbol>` zeichnet das eigene Symbol der Plattform: ein [SF Symbol](https://developer.apple.com/sf-symbols/) auf iOS, ein [Material Symbol](https://fonts.google.com/icons) auf Android, so wie Tab-Icons es sind ([Navigation](../../../../docs/navigation.md#icons)).

| Prop        | Bedeutung                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| `name`      | Ein Name, den beide Plattformen haben, wie `"star"`, oder `{ ios, android }`, da die meisten abweichen. |
| `size`      | Punktgröße; standardmäßig 24. Die View ist ein Quadrat davon, sofern die App sie nicht dimensioniert.   |
| `weight`    | `ultralight`, `thin`, `light`, `regular` (Standard), `medium`, `semibold`, `bold`, `heavy`, `black`.    |
| `tintColor` | Die Farbe des Symbols; standardmäßig Schwarz, wie bei Text.                                             |

```tsx
<Symbol name={{ ios: 'square.and.arrow.up', android: 'share' }} size={20} />
```

Ein literaler Name, den eine Plattform nicht hat, lässt das Kompilieren an seiner Zeile fehlschlagen, für `<Symbol name>` wie für `<Tab icon>`. Ein zur Laufzeit berechneter Name wird stattdessen vom Renderer geprüft, der einen fehlenden Namen als ungültige Prop meldet. Androids Material-Symbols-Schrift hat eine Stärke, also verstärken `medium` und schwerer die Kontur und leichtere Stärken zeichnen regular; iOS zeichnet jede SF-Symbols-Stärke.

## Vertiefung

[Assets und Symbole](../../../../docs/assets.md) behandelt, wie die Shells Bilder benennen, wie der Compiler die Größe jeder Datei liest, Live Patch bearbeiteter Bilder und woher die geprüften Symbolnamen stammen.
