# Mouvement

Tout ce qui bouge est une petite algèbre, écrite en données : des sources (une valeur de mouvement, un geste, un signal, le temps), des transformations (`map`, `clamp`, `interpolate` ; `timing`, `spring`, `decay` ; `delay`, `sequence`, `parallel`, `stagger`, `repeat`, `keyframes`) et des puits (les props). Les déclarations se compilent en programmes que le thread UI exécute à côté des vues, donc bouger n'attend jamais JavaScript et ne rend jamais un composant à nouveau.

```tsx
import { Box, interpolate, motion, pan, spring } from 'kuito';

export function Card() {
  const drag = pan({ axis: 'x' }).release(spring());
  const x = motion(0).follows(drag.x);

  return (
    <Box
      translateX={x}
      opacity={interpolate(x, [0, 200], [1, 0.5])}
      rotate={x.map((v) => v / 20)}
      gestures={[drag]}
    />
  );
}
```

Un élément glissable complet qui revient à l'origine par un ressort avec la vélocité du doigt : aucun gestionnaire, et rien ne traverse vers le thread JavaScript pendant qu'il bouge.

## Valeurs de mouvement

`motion(initial)` fonctionne comme `signal()` : appelez-le pendant qu'un composant s'initialise, lisez et écrivez `.value` n'importe où. Utilisez `signal()` pour les valeurs auxquelles les composants réagissent, et `motion()` pour les valeurs avec lesquelles l'écran bouge.

- `x.follows(source)` déplace `x` avec `source` sur le thread UI : le champ d'un geste, une autre valeur de mouvement, ou une valeur dérivée. `null` l'arrête.
- `x.map(fn)`, `interpolate(x, input, output)` et `clamp(x, min, max)` fabriquent des valeurs dérivées, calculées sur le thread UI chaque fois que `x` bouge.
- `x.value = animation` l'anime ; `x.value = 5` le déplace immédiatement.

## Gestes

Les gestes sont des valeurs, reconnues nativement, et attachées avec une seule prop. `pan()` déplace `x`, `y` (sa translation, ajoutée) ; `touches()` déplace `x`, `y` (où se trouve le doigt) ; `pinch()` déplace `scale`, en multipliant ; `rotate()` déplace `rotation` en degrés. Chaque geste accepte les callbacks qui ont besoin de JavaScript : `onStart`, `onChange` et `onEnd(event, success)`.

`gesture.release(animation)` dit comment ses suiveurs lâchent prise, avec la vélocité du geste : `drag.release(spring())` revient à l'origine par un ressort, `drag.release(decay({ clamp: [0, 400] }))` glisse sur sa lancée, `drag.release(spring().to([0, 400]))` s'accroche au point le plus proche. Plusieurs gestes sur une vue sont en concurrence ; `race(a, b)`, `together(a, b)` et `orElse(a, b)` les composent comme des valeurs, et s'imbriquent.

## Animations

Les constructeurs décrivent comment une valeur bouge ; `.to(target)` dit où :

```tsx
<Box opacity={timing(200).to(0)} translateY={delay(80, spring().to(12))} />;

offset.value = sequence(timing(120).to(1.2), spring().to(1));
offset.value = repeat(keyframes({ 0: 1, 50: 1.1, 100: 1 }, 600));
```

`timing` dure 300 ms avec `easing.inOut` par défaut ; `spring` a par défaut un amortissement de 10, une raideur de 100, une masse de 1 ; `repeat` un count Infinity.

Une animation démarre à la prochaine image, d'où que la valeur soit alors. Affecter une valeur ou une autre animation l'interrompt, et son `onEnd` s'exécute avec `false`. Les nombres et les couleurs hexadécimales s'animent ; plusieurs cibles sont des points d'accroche.

## Props animées : `animate` et `transition`

```tsx
<Box
  animate={{ opacity: open.value ? 1 : 0.6, scale: open.value ? 1 : 0.96 }}
  transition={{ opacity: timing(200), transform: spring({ damping: 14 }) }}
/>
```

`animate` accepte des valeurs pour les props animables (`opacity`, `backgroundColor`, les translations, les échelles et `rotate`). Ses premières valeurs s'appliquent immédiatement ; chaque changement ensuite bouge comme `transition` le dit. `transition` nomme une animation par groupe : `opacity`, `backgroundColor`, `transform` ou `all`. Sans elle, les transformations font ressort et le reste exécute des timings de 300 ms. Une `transition` CSS se compile vers la même prop.

## Entrer, sortir et se déplacer : `enter`, `exit`, `layout`

Un effet nomme les props depuis lesquelles une vue entre et vers lesquelles elle sort : `fade`, `slide.up(d)`, `slide.down(d)`, `slide.left(d)`, `slide.right(d)` (`d` vaut 24 par défaut), `zoom(scale)` (0.85 par défaut) et `keyframes`.

```tsx
<Box enter={fade.and(slide.up(12))} exit={fade} layout={spring()} />
```

`a.and(b)` et `parallel(a, b, ...)` jouent les effets en même temps ; `sequence` l'un après l'autre ; `stagger(ms, a, b, ...)` chacun `ms` après le précédent. `enter` joue à la création de la vue. Une vue retirée avec `exit` quitte l'arbre de JavaScript immédiatement mais reste à l'écran, sans prendre de touchers, pendant qu'elle s'anime vers la sortie. `layout={spring()}` (ou `timing(...)`) anime la vue vers chaque nouveau cadre que la mise en page lui donne.

Avec le réglage de réduction des animations de l'utilisateur activé, chaque animation, transition et effet saute à sa fin. Les gestes suivent toujours le doigt.

## En profondeur

[Mouvement](../../../../docs/motion.md) couvre chaque option de geste et d'animation, comment le compilateur et le noyau placent le code sur le thread UI, les limites des plateformes et le contrat natif.
