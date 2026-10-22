# Ressources et symboles

Les images livrées avec l'app sont importées, pas chargées par URL : le
compilateur embarque chacune d'elles dans les deux shells et fait de l'import
une source dont il connaît déjà la taille. Les symboles propres aux plateformes
sont une primitive, `<Symbol>`, vérifiée par son nom à la compilation de l'app.

```tsx
import { Image, Symbol } from 'kuito';
import cover from './assets/cover.png';

<Image src={cover} />
<Symbol name="star" size={18} weight="semibold" tintColor="#f5c451" />
```

## Images embarquées

`import cover from './cover.png'` fait de `cover` une `BundledImageSource`,
`{ asset, width, height }`, que `<Image src>` accepte comme une URL. Les apps
typent l'import via `kuito/src/ui/assets.d.ts`, que le `tsconfig.json` d'une
nouvelle app inclut.

| Fichier        | iOS                                   | Android                                      |
| -------------- | ------------------------------------- | -------------------------------------------- |
| `.png`, `.jpg` | un jeu d'images de ses échelles       | `drawable-mdpi`, `-xhdpi`, `-xxhdpi`         |
| `.svg`         | le SVG, dessiné en vectoriel          | un VectorDrawable, converti au build         |
| `.pdf`         | la première page du PDF, en vectoriel | sa première page, dessinée par `PdfRenderer` |

- **Échelles.** `cover@2x.png` et `cover@3x.png` à côté de `cover.png` sont la
  même image en 2× et 3× ; chaque plateforme choisit celle qui convient à
  l'écran. L'import nomme le fichier de base, qui peut lui-même être absent.
- **Taille.** Le compilateur lit la taille en points depuis le fichier : les
  pixels d'une image matricielle divisés par sa plus grande échelle, les
  `width` et `height` d'un SVG (sinon son `viewBox`), la page d'un PDF. Une
  Image d'une source embarquée sans `width`, `height` ni classe qui la
  dimensionne a cette taille ; avec un seul côté donné, elle conserve le
  rapport d'aspect de l'image. Une taille donnée par l'app l'emporte toujours.
- **Noms.** Les deux shells connaissent une image par son chemin depuis la
  racine de l'app (le répertoire contenant `kuito.config.ts`), sous forme de
  nom de ressource Android : `assets/Cover Art.png` est `asset_assets_cover_art`.
  Deux fichiers qui aboutissent au même nom sont une erreur de compilation qui
  les nomme tous les deux.
- **Fichiers manquants.** L'import d'une image qui n'existe pas, à quelque
  échelle que ce soit, est une erreur de compilation à l'import, comme tout
  import non résolu : renommer une image casse le build là où elle est
  utilisée, pas sur un appareil.
- **Vectoriels.** iOS conserve SVG et PDF en vectoriel, ils restent donc nets
  à toute taille. Android dessine les vectoriels dans son propre format XML,
  qui couvre ce dont les icônes sont faites : chemins, rectangles, cercles,
  ellipses, lignes, polylignes et polygones ; groupes avec transformations
  `translate`, `scale`, `rotate` et `matrix` sans cisaillement ; remplissages
  et contours unis avec leur opacité, leurs extrémités, leurs jointures et leur
  `fill-rule`. Tout le reste (texte, dégradés, feuilles `<style>`, chemins de
  découpe, masques, filtres, images intégrées, `<use>`) fait échouer le build
  Android en nommant l'élément ; embarquez-en un PNG ou un PDF à la place. Un
  PDF est redessiné à la taille à laquelle il apparaît, sur les deux
  plateformes.

### Live Patch

Une image importée est surveillée comme un fichier source. En modifier une
recompile l'app et envoie le patch ; `kuito dev` constate que le shell en
cours d'exécution a été construit avec d'autres octets, ou sans l'image du
tout, et le dit dans son flux (`Rebuilding the shell: the app now bundles
assets/cover.png`) pendant qu'il reconstruit et relance, comme il le fait pour
un module natif nouvellement requis. Un fichier `@2x` ajouté à côté d'une image
est pris en compte à la prochaine modification de son importateur.

Sur l'appareil, une Image dont le shell ne possède pas le nom embarqué est une
prop invalide (`The app was built without the image …: build it again`), jamais
une vue vide.

## Symboles

`<Symbol>` dessine le symbole propre à la plateforme : un
[SF Symbol](https://developer.apple.com/sf-symbols/) sur iOS, un
[Material Symbol](https://fonts.google.com/icons) sur Android, comme le sont
les icônes d'onglet ([navigation](navigation.md#icons)).

| Prop        | Signification                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `name`      | Un nom que les deux plateformes possèdent, comme `"star"`, ou `{ ios, android }`, car la plupart diffèrent.                     |
| `size`      | Taille en points ; 24 par défaut. La vue est un carré de cette taille sauf si l'app la dimensionne, et le symbole tient dedans. |
| `weight`    | `ultralight`, `thin`, `light`, `regular` (par défaut), `medium`, `semibold`, `bold`, `heavy`, `black`.                          |
| `tintColor` | La couleur du symbole ; noir par défaut, comme Text.                                                                            |

```tsx
<Symbol name={{ ios: 'square.and.arrow.up', android: 'share' }} size={20} />
```

Un nom littéral qu'une plateforme ne possède pas fait échouer la compilation à
sa ligne, pour `<Symbol name>` comme pour `<Tab icon>` :

```
app/home.tsx:12:20 <Symbol name="magnifyingglass">: no Material Symbol has that name (fonts.google.com/icons)
```

Le compilateur lit les noms iOS depuis les SF Symbols que le Mac liste, un nom
iOS est donc vérifié quand l'app compile sur un Mac (ce qu'un build iOS
impose), et ceux d'Android depuis la police Material Symbols avec laquelle le
shell Android dessine. Un nom calculé à l'exécution est vérifié par le moteur
de rendu à la place, qui signale un nom qu'il ne possède pas comme une prop
invalide.

La police Material Symbols d'Android n'a qu'une graisse, `medium` et au-delà
épaississent donc le contour et les graisses plus légères dessinent en regular ;
iOS dessine chaque graisse des SF Symbols.
