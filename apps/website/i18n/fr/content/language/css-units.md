# Unités CSS

Kuito accepte `px`, `rem` et `em` dans les fichiers `.css` pour les propriétés de longueur natives : `width`, `height`, les tailles `min-`/`max-`, `padding` et ses côtés, `gap`, `border-radius`, `border-width`, `font-size`, `letter-spacing`, `line-height`, les translations et les ombres.

```css
:root {
  font-size: 18px;
  --space: 1rem;
}

.card {
  font-size: 1.25rem; /* 22.5 native logical units */
  padding: 2em; /* 45 units = element font size x 2 */
  gap: var(--space); /* 18 units */
  border-radius: 12px; /* 12 native logical units */
}
```

## px, rem et em

- `px` est un pixel logique CSS, compilé en un point de mise en page sur iOS ou en un pixel indépendant de la densité sur Android, pas un pixel physique de l'écran.
- `rem` est multiplié à la compilation par la taille de police racine. Par défaut : `16px`. Remplacez-la avec `:root { font-size: 18px; }` ou l'option `rootFontSize` du compilateur. Une app a une seule taille de police racine : déclarez-la dans une feuille de style et `@import`ez celle-ci là où `rem` doit la suivre ; une seconde déclaration ailleurs dans le bundle est une erreur.
- `em` est résolu lors de la préparation du plan de vues natif : `font-size: Nem` est relatif à la taille héritée du parent ; les autres dimensions en `em` sont relatives à la taille de police calculée de l'élément.
- Les longueurs sans unité et `dp` restent acceptés.

```css
.caption {
  font-size: 0.875em; /* relative to inherited font size */
}
```

## Autres valeurs

- Les durées de `transition` acceptent `ms` et `s` (normalisées en millisecondes). `opacity` est sans unité.
- `var(--token)` se résout à la compilation, références avant et chaînes comprises. Les jetons manquants ou circulaires produisent des erreurs de compilateur explicites. Les jetons d'une feuille de style `@import`ée, y compris son `font-size` de `:root`, s'appliquent aussi ([Jetons](../../../../docs/styles.md#tokens)).
- Les dimensions non prises en charge (`%`, `vh`, `vw`, `calc()` et autres) font échouer la compilation plutôt que d'être ignorées en silence.

## Limitations

Ni Hermes ni le thread UI natif n'analysent du texte `.css` ; les adaptateurs de plateforme ne reçoivent que des nombres scalaires. Changer la taille de police d'un ancêtre par un signal ne recalcule pas encore automatiquement toutes les mesures `em` des descendants. Ne présumez pas d'une compatibilité complète avec le CSS des navigateurs.

## En profondeur

[Unités de longueur CSS](../../../../docs/css-units.md) couvre la frontière d'implémentation entre le compilateur et la planification des vues, et le travail qui reste séparé.
