# Styles

Kuito compile les styles à la compilation en propriétés natives. Les modules `.css` et `styles({...})` partagent une même table de propriétés : CSS utilise les noms en kebab-case, `styles()` le camelCase, et les deux acceptent les mêmes valeurs, chaînes raccourcies comprises. Rien n'analyse du CSS sur l'appareil.

## Feuilles de style

```css
.card {
  padding: 20px 24px;
  border: 1px solid #ffffff22;
  border-radius: 20px;
  box-shadow: 0 12px 32px #00000066;
  background: linear-gradient(135deg, #1e3a5f, #0b1220);
}
```

```tsx
const sheet = styles({
  card: { padding: '20px 24px', boxShadow: '0 12px 32px #00000066', fontWeight: 600 },
});
```

`styles()` initialise un `const` partout où l'on peut en déclarer un : la portée du module, le corps d'un composant, un bloc. Les longueurs acceptent `px`/`dp`, `rem` et `em` ([Unités CSS](./css-units.md)). Les propriétés inconnues et les valeurs non prises en charge font échouer le build avec le fichier, la ligne et la raison.

## La prop `class`

Un élément prend ses classes par `class` : des noms issus d'un import `.css` ou de `styles()`, en chaîne de noms séparés par des espaces ou en liste dont les entrées falsy sont ignorées. Quand un signal qu'elle lit change, la branche de la vue est planifiée à nouveau avec les nouvelles classes. Les déclarations s'appliquent dans l'ordre du source, et la classe la plus tardive dans `class` l'emporte.

```tsx
import css from './card.css';

<VStack class={[css.card, selected.value && css.selected]} />;
```

## Variantes

Les variantes d'une classe sont des règles sur ses attributs de données, `.card[data-size=large]` dans une feuille de style et `variants` dans une entrée de `styles()`. Une liste de classes les choisit avec un objet d'attributs de données ; une valeur falsy n'en choisit aucune. Une variante l'emporte sur sa classe.

```css
.card {
  padding: 12px;
}
.card[data-size='large'] {
  padding: 24px;
}
```

```tsx
const button = styles({
  base: { padding: '8px 16px', variants: { tone: { primary: { backgroundColor: '#ff5a5f' } } } },
});

<Pressable class={[button.base, { tone: tone.value }]} />;
```

## La prop `style`

Une primitive prend aussi ses propres styles, `style={{ ... }}`, avec les mêmes propriétés camelCase et les mêmes valeurs que `styles()`. Une déclaration dont la valeur change doit nommer une seule prop native (`opacity`, `paddingTop`, `backgroundColor`) ; un raccourci avec une expression est une erreur de build. `style` l'emporte sur `class` pour les props que les deux fixent : partagez les styles avec `class`, gardez `style` pour ce qu'une seule vue a besoin.

```tsx
<Box style={{ padding: '4px 8px', borderRadius: 12, opacity: dim.value ? 0.5 : 1 }} />
```

## Jetons

Les propriétés personnalisées déclarées dans `:root` sont des jetons : `var(--name)` est remplacé par sa valeur à la compilation. Une feuille de style voit ses propres jetons et ceux des feuilles de style qu'elle `@import`e. Un bloc `:root` dans `@media (prefers-color-scheme: dark)` redéfinit les jetons pour ce schéma ; un changement de thème ne renvoie que les props qui le suivent.

```css
@import './tokens.css';

.card {
  padding: var(--space);
  border: 1px solid var(--accent);
}
```

## Conditions et plateformes

Les blocs `@media` contiennent des règles dont les déclarations s'appliquent tant que leur requête tient. Une requête est des fonctionnalités entre parenthèses jointes par `and`. Les déclarations d'une condition l'emportent sur celles de sa classe tant qu'elle tient ; une classe plus tardive dans `class` l'emporte sur les deux.

| Fonctionnalité           | Valeurs                         |
| ------------------------ | ------------------------------- |
| `min-width`, `max-width` | une longueur en `px`            |
| `width-class`            | `compact`, `medium`, `expanded` |
| `prefers-color-scheme`   | `light`, `dark`                 |
| `prefers-reduced-motion` | `reduce`, `no-preference`       |

Un bloc `@platform` nomme `ios` ou `android` ; le bundle de l'autre plateforme ne le voit jamais. `platform` de `kuito` est une constante que le compilateur fixe par bundle. Il n'y a pas de `Platform.select` à l'exécution.

```css
@media (width-class: expanded) {
  .grid {
    flex-direction: row;
  }
}

@platform android {
  .card {
    padding: 12px;
  }
}
```

## En profondeur

[Styles natifs](../../../../docs/styles.md) couvre les valeurs et les couleurs, la table de propriétés, la mise en page flexbox, les transitions et les notes par plateforme.
