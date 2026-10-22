# Ressources et symboles

Les images livrées avec l'app sont importées, pas chargées par URL : le compilateur embarque chacune d'elles dans les deux shells et fait de l'import une source dont il connaît déjà la taille. Les symboles propres aux plateformes sont une primitive, `<Symbol>`, vérifiée par nom à la compilation de l'app.

```tsx
import { Image, Symbol } from 'kuito';
import cover from './assets/cover.png';

<Image src={cover} />
<Symbol name="star" size={18} weight="semibold" tintColor="#f5c451" />
```

## Images embarquées

`import cover from './cover.png'` fait de `cover` une `BundledImageSource`, `{ asset, width, height }`, que `<Image src>` accepte comme une URL. Les apps typent l'import via `kuito/src/ui/assets.d.ts`, que le `tsconfig.json` d'une nouvelle app inclut.

| Fichier        | iOS                                   | Android                                      |
| -------------- | ------------------------------------- | -------------------------------------------- |
| `.png`, `.jpg` | un jeu d'images de ses échelles       | `drawable-mdpi`, `-xhdpi`, `-xxhdpi`         |
| `.svg`         | le SVG, dessiné en vectoriel          | un VectorDrawable, converti au build         |
| `.pdf`         | la première page du PDF, en vectoriel | sa première page, dessinée par `PdfRenderer` |

- **Échelles.** `cover@2x.png` et `cover@3x.png` à côté de `cover.png` sont la même image en 2x et 3x ; chaque plateforme choisit celle de l'écran.
- **Taille.** Le compilateur lit la taille en points depuis le fichier. Une Image d'une source embarquée sans `width`, `height` ni classe qui la dimensionne fait cette taille ; avec un seul côté, elle garde le rapport d'aspect de l'image. Une taille donnée par l'app l'emporte toujours.
- **Fichiers manquants.** L'import d'une image qui n'existe pas, à n'importe quelle échelle, est une erreur de compilation à l'import : renommer une image casse le build là où elle est utilisée, pas sur un appareil.

## Vectoriels

iOS garde les SVG et PDF en vectoriel, donc ils restent nets à toute taille. Android dessine les vectoriels dans son propre format XML, qui couvre ce dont les icônes sont faites : chemins, rectangles, cercles, ellipses, lignes, polylignes et polygones ; groupes avec des transformations `translate`, `scale`, `rotate` et `matrix` sans cisaillement ; remplissages et contours unis. Tout le reste (texte, dégradés, feuilles `<style>`, chemins de découpe, masques, filtres, images intégrées, `<use>`) fait échouer le build Android en nommant l'élément ; embarquez-en un PNG ou un PDF à la place.

## Symboles

`<Symbol>` dessine le symbole propre à la plateforme : un [SF Symbol](https://developer.apple.com/sf-symbols/) sur iOS, un [Material Symbol](https://fonts.google.com/icons) sur Android, comme le sont les icônes d'onglets ([navigation](../../../../docs/navigation.md#icons)).

| Prop        | Signification                                                                                               |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| `name`      | Un nom que les deux plateformes possèdent, comme `"star"`, ou `{ ios, android }`, car la plupart diffèrent. |
| `size`      | Taille en points ; 24 par défaut. La vue est un carré de cette taille sauf si l'app la dimensionne.         |
| `weight`    | `ultralight`, `thin`, `light`, `regular` (par défaut), `medium`, `semibold`, `bold`, `heavy`, `black`.      |
| `tintColor` | La couleur du symbole ; noir par défaut, comme Text.                                                        |

```tsx
<Symbol name={{ ios: 'square.and.arrow.up', android: 'share' }} size={20} />
```

Un nom littéral qu'une plateforme n'a pas fait échouer la compilation à sa ligne, pour `<Symbol name>` comme pour `<Tab icon>`. Un nom calculé à l'exécution est vérifié par le moteur de rendu à la place, qui signale un nom qu'il n'a pas comme une prop invalide. La police Material Symbols d'Android n'a qu'une graisse, donc `medium` et plus lourd épaississent le contour et les graisses plus légères dessinent regular ; iOS dessine chaque graisse des SF Symbols.

## En profondeur

[Ressources et symboles](../../../../docs/assets.md) couvre comment les shells nomment les images, comment le compilateur lit la taille de chaque fichier, le Live Patch des images modifiées, et d'où viennent les noms de symboles qu'il vérifie.
