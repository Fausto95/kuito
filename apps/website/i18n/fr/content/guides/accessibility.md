# Accessibilité

Un seul jeu de props d'accessibilité fonctionne sur chaque vue, sur les deux plateformes, avec VoiceOver sur iOS et TalkBack sur Android : `label`, `hint`, `role` (les noms d'ARIA), `live`, `actions`, et les faits `aria-*` d'ARIA.

```tsx
<Pressable
  role="button"
  label="Play"
  hint="Starts the episode"
  aria-disabled={!ready.value}
  onPress={play}
>
  <Image src={icon} />
</Pressable>
```

## Props

- `accessible` fait de la vue un seul élément, lu comme son `label` ou, à défaut, le texte de ses enfants.
- `label` est ce que lit le lecteur d'écran ; `hint` est ce qui se passe à l'activation, lu après une pause.
- `role` est ce qu'est la vue, dans les noms d'ARIA : `button`, `heading`, `img`, `link`, `slider`, `switch`, `tab` et d'autres. Un rôle hors de ceux pris en charge est une erreur qui les nomme.
- `aria-disabled`, `aria-selected`, `aria-checked`, `aria-busy` et `aria-expanded` sont l'état de la vue ; `aria-valuemin`, `aria-valuemax`, `aria-valuenow` et `aria-valuetext` une plage, ou une valeur textuelle.
- `aria-hidden` : les lecteurs d'écran sautent la vue et sa sous-arborescence.
- `actions` liste des actions standard, ou personnalisées par `label` ; `onAction` est appelé avec `{ actionName }` quand l'une d'elles est effectuée.

Un Pressable est un seul élément, lu comme le texte de ses enfants, donc il lui faut quelque chose à lire : donnez-lui un `label`, ou du texte parmi ses enfants. Un Pressable sans l'un ni l'autre (une icône seule) est une erreur de build qui nomme sa ligne. Chaque fait est sa propre prop native, donc en changer un ne met à jour que celui-là.

## Actions

`activate`, `increment`, `decrement` et `longpress` remplacent les gestes propres du lecteur : double tap, balayage vers le haut et vers le bas sur un élément ajustable sur iOS, et le clic, le défilement avant et arrière, et le clic long de TalkBack. `magicTap` et `escape` sont des gestes VoiceOver sans équivalent TalkBack. Tout autre nom est une action personnalisée, dans le rotor d'actions de VoiceOver et le menu d'actions de TalkBack, sous son `label`.

```tsx
<HStack
  accessible
  role="slider"
  label="Rating"
  aria-valuemin={0}
  aria-valuemax={5}
  aria-valuenow={stars.value}
  actions={[{ name: 'increment' }, { name: 'decrement' }]}
  onAction={(event) => change(event.actionName === 'increment' ? 1 : -1)}
>
  ...
</HStack>
```

## Le module accessibility

```tsx
import { watch, accessibility } from 'kuito';

accessibility.announce('12 shows found');
accessibility.announce('Saved', { queue: true });
accessibility.focus(title.current);

accessibility.screenReader.value; // true, false, or null until the platform answers
watch(accessibility.reduceMotion, (calm) => (animations.value = !calm)); // in a component
```

- Une annonce interrompt la parole en cours ; `queue: true` l'attend (iOS ; TalkBack met toujours en file d'attente).
- `focus` prend un élément, tel que `ref.current`.
- `screenReader` et `reduceMotion` sont des signaux. La première lecture interroge le côté natif une fois et vaut `null` jusqu'à sa réponse ; la réponse et chaque changement ultérieur mettent les deux à jour.

## Régions dynamiques

`live` annonce les changements du texte d'une vue : `polite` attend la fin de la parole en cours, `assertive` l'interrompt. Android a des régions dynamiques nativement ; sur iOS, Kuito observe les Text à l'intérieur de la région et, une fois un lot de changements appliqué, annonce ce que la région lit désormais.

```tsx
<Text live="polite">{status.value}</Text>
```

## En profondeur

[Accessibilité](../../../../docs/accessibility.md) couvre comment chaque rôle et état se lit dans VoiceOver et TalkBack, ce dont iOS 16 a besoin, et comment les annonces et les actions franchissent la frontière native.
