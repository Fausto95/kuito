# Unités de longueur CSS dans Kuito

Kuito accepte les unités familières **`px`**, **`rem`** et **`em`** dans les fichiers `.css` pour les propriétés de longueur natives (`width`, `height`, les tailles `min-`/`max-`, `padding` et ses côtés, `gap`, `border-radius`, `border-width`, `font-size`, `letter-spacing`, `line-height`, les translations et les ombres). La liste complète se trouve dans [Styles natifs](styles.md).

```css
:root {
  font-size: 18px;
  --space: 1rem;
}

.card {
  font-size: 1.25rem; /* 22.5 native logical units */
  padding: 2em; /* 45 units = element font size × 2 */
  gap: var(--space); /* 18 units */
  border-radius: 12px; /* 12 native logical units */
}

.caption {
  font-size: 0.875em;
} /* relative to inherited font size */
```

## Règles de compilation

- **`px`** est un _pixel logique CSS_, compilé en un point de mise en page sur iOS ou en un pixel indépendant de la densité sur Android — pas un pixel physique de l'écran.
- **`rem`** est multiplié à la construction par la taille de police racine. Par défaut : `16px`. Remplacez-la avec `:root { font-size: 18px; }` ou l'option `rootFontSize` du compilateur. Une application a une seule taille de police racine : déclarez-la dans une feuille de styles et `@import`ez celle-ci là où `rem` doit la suivre ; une seconde déclaration ailleurs dans le bundle est une erreur.
- **`em`** est compilé en une instruction numérique compacte relative à la police. Kuito la résout en préparant le plan de vues natif : `font-size: Nem` est relatif à la taille héritée du parent ; les autres dimensions en `em` sont relatives à la taille de police calculée de l'élément.
- **Les longueurs sans unité et `dp`** restent acceptées pour la compatibilité avec les styles Kuito existants.
- Les durées de **`transition`** acceptent `ms` et `s` (normalisées en millisecondes). **`opacity`** est sans unité.
- **`var(--token)`** se résout à la construction, y compris les références en avant et les chaînes de références. Les jetons manquants ou circulaires produisent des erreurs explicites du compilateur. Les jetons d'une feuille de styles `@import`ée, y compris sa taille de police `:root`, s'appliquent aussi ([Jetons](styles.md#tokens)).
- Les dimensions non prises en charge (`%`, `vh`, `vw`, `calc()` et autres) font échouer la compilation au lieu d'être silencieusement ignorées.

## Frontière d'implémentation

Les feuilles de styles compilent en propriétés numériques natives plus des instructions `em` pré-analysées. Ni Hermes ni le thread UI natif n'analysent de texte `.css`. Les instructions relatives sont multipliées par la taille de police calculée lors de la planification des vues ; les adaptateurs de plateforme ne reçoivent que des nombres scalaires.

**Limitation actuelle :** l'héritage natif de police et les `em` sont recalculés lors du rendu initial et d'un Live Patch compatible, mais changer la taille de police d'un ancêtre par un signal ne recalcule pas encore automatiquement toutes les mesures en `em` des descendants. Les requêtes média CSS, les jetons dynamiques, la cascade complète du navigateur et la mise à l'échelle Dynamic Type du système restent également des travaux distincts. Évitez de supposer une compatibilité complète avec le CSS des navigateurs.

Voir `src/style/compiler.ts`, `src/runtime/plan-values.ts` et `test/css-units.test.ts`.
