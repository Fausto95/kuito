# Accessibilité

Un seul jeu de props d'accessibilité fonctionne sur chaque vue, sur les deux
plateformes, avec VoiceOver sur iOS et TalkBack sur Android : `label`, `hint`,
`role` (les noms d'ARIA), `live`, `actions`, et les faits `aria-*` d'ARIA.

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

| Prop                                                                           | Signification                                                                                                                 |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `accessible`                                                                   | Fait de la vue un seul élément, lu comme son `label` ou, à défaut, le texte de ses enfants.                                   |
| `label`                                                                        | Ce que lit le lecteur d'écran.                                                                                                |
| `hint`                                                                         | Ce qui se passe à l'activation, lu après une pause.                                                                           |
| `role`                                                                         | Ce qu'est la vue, dans les noms d'ARIA : `button`, `heading`, `img`, `link`, `slider`, `switch`, `tab`, ... (ci-dessous).     |
| `aria-disabled`, `aria-selected`, `aria-checked`, `aria-busy`, `aria-expanded` | L'état de la vue ; `aria-checked` peut valoir `'mixed'`.                                                                      |
| `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-valuetext`            | Une plage, ou une valeur textuelle.                                                                                           |
| `aria-hidden`                                                                  | Les lecteurs d'écran sautent la vue et sa sous-arborescence.                                                                  |
| `live`                                                                         | `off`, `polite` ou `assertive` : les changements du texte de la vue sont annoncés ; voir [régions dynamiques](#live-regions). |
| `actions`                                                                      | `[{ name, label? }]` : actions standard, ou personnalisées listées par `label`.                                               |
| `onAction`                                                                     | Appelé avec `{ actionName }` quand l'une d'elles est effectuée.                                                               |

Un **Pressable est un seul élément**, lu comme le texte de ses enfants, donc il
lui faut quelque chose à lire : donnez-lui un `label`, ou du texte parmi ses
enfants. Un Pressable sans ni l'un ni l'autre (une icône seule) est une erreur
de build nommant sa ligne.

### Rôles

| Rôle                                                                             | VoiceOver                               | TalkBack                                       |
| -------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------- |
| `button`, `menuitem`, `radio`, `tab`, `combobox`                                 | Button                                  | Button, RadioButton, ou le nom du rôle         |
| `checkbox`, `switch`                                                             | Button, avec l'état coché               | CheckBox, Switch                               |
| `heading`                                                                        | Heading (rotor)                         | Heading                                        |
| `img`                                                                            | Image                                   | ImageView                                      |
| `link`                                                                           | Link                                    | "link"                                         |
| `slider`, `spinbutton`                                                           | Adjustable (balayage haut/bas)          | SeekBar, "spin button" (actions de défilement) |
| `searchbox`                                                                      | Search field                            | EditText                                       |
| `tablist`                                                                        | Tab bar : les onglets sont lus "n of m" | "tab list"                                     |
| `progressbar`, `timer`                                                           | Updates frequently                      | ProgressBar, "timer"                           |
| `summary`                                                                        | Summary                                 | "summary"                                      |
| `alert`, `grid`, `list`, `menu`, `menubar`, `radiogroup`, `scrollbar`, `toolbar` | Aucun trait                             | Le nom du rôle                                 |
| `none`, `presentation`                                                           | Rien                                    | Rien                                           |

Un rôle hors de cette liste est une erreur qui nomme ceux pris en charge.
L'état devient ce que chaque lecteur a pour lui : `aria-disabled` grise
l'élément, `aria-selected` le sélectionne, `aria-checked` est un état cochable
sur Android et "checked" / "not checked" (ou "on" / "off" pour un switch) sur
iOS, `aria-expanded` est une action déplier ou replier sur Android et
"expanded" / "collapsed" sur iOS, et `aria-busy` est lu "busy". Une plage est
une plage sur Android et sa valeur courante sur iOS ; `aria-valuetext`
l'emporte sur `aria-valuenow` sur les deux. Chaque fait est sa propre prop
native, donc en changer un ne met à jour que celui-là.

### Actions

`activate`, `increment`, `decrement` et `longpress` remplacent les gestes
propres du lecteur : double tap, balayage vers le haut et vers le bas sur un
élément ajustable sur iOS, et le clic, le défilement avant et arrière, et le
clic long de TalkBack. `magicTap` et `escape` sont des gestes VoiceOver sans
équivalent TalkBack et ne font rien sur Android. Tout autre nom est une action
personnalisée, dans le rotor d'actions de VoiceOver et le menu d'actions de
TalkBack, sous son `label`.

Sur iOS 16 les actions standard sont aussi des actions personnalisées : les
gestionnaires UIKit pour celles-ci exigent iOS 17. Pour la même raison, un
conteneur `accessible` sans label n'est lu à partir de ses enfants que sur
iOS 17 et ultérieur ; donnez-lui un `label` pour iOS 16. Un Pressable lit ses
enfants sur toutes les versions.

```tsx
<HStack
  accessible
  role="slider"
  label="Rating"
  aria-valuemin={0}
  aria-valuemax={5}
  aria-valuenow={stars.value}
  aria-valuetext={stars.value + ' of 5 stars'}
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

- Une annonce interrompt la parole en cours ; `queue: true` l'attend (iOS ;
  TalkBack met toujours en file d'attente).
- `focus` prend un élément, tel que `ref.current`.
- L'état du lecteur d'écran est VoiceOver sur iOS et l'exploration tactile
  (TalkBack) sur Android. La réduction des animations correspond au réglage
  iOS et au réglage Android "Supprimer les animations" (une échelle de durée
  d'animation de 0).
- `screenReader` et `reduceMotion` sont des signaux. La première lecture
  interroge le côté natif une fois et vaut `null` jusqu'à sa réponse ; la
  réponse et chaque changement ultérieur mettent les deux à jour, et une
  valeur qui reste la même n'est pas un changement.

## Régions dynamiques

`live` annonce les changements du texte d'une vue : `polite` attend la fin de la parole en cours, `assertive` l'interrompt. Android
a des régions dynamiques nativement. UIKit n'en a pas, donc sur iOS Kuito
observe les Text à l'intérieur de la région et, une fois un lot de changements
appliqué, annonce ce que la région lit désormais.

```tsx
<Text live="polite">{status.value}</Text>
```

## Comment ça franchit la frontière

Les annonces, le focus et la demande d'état sont des commandes dans la file de
mutations, comme `focus()` (voir [clavier](keyboard.md#how-it-crosses-the-boundary)).
L'état arrive comme l'événement natif de l'application `accessibility.status`
avec `{ screenReaderEnabled, reduceMotionEnabled }` ; les actions
d'accessibilité arrivent comme `<id>.accessibilityaction` avec
`{ actionName }`.

Sur iOS, UIKit ne calcule les valeurs d'accessibilité par défaut d'un label ou
d'un bouton que lorsqu'une technologie d'assistance est active, donc le
renderer n'écrit une propriété que lorsqu'une prop la définit, et restaure ce
qui s'y trouvait quand la prop disparaît.
