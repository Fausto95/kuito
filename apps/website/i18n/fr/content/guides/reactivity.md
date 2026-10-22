# Réactivité

Les signaux contiennent les valeurs qui changent. Le JSX qui lit un signal le suit, sans ré-exécuter le composant.

## Signaux

```tsx
import { Pressable, Text, computed, signal, watch } from 'kuito';

function Counter() {
  const count = signal(0);
  const doubled = computed(() => count.value * 2);
  watch(count, (next, previous) => console.log(previous, '->', next));
  return (
    <Pressable onPress={() => count.value++}>
      <Text opacity={count.value > 0 ? 1 : 0.5}>{doubled}</Text>
    </Pressable>
  );
}
```

- `signal(initial)` créé pendant qu'un composant s'initialise appartient au slot de ce composant ; créé n'importe où ailleurs, c'est un signal à part.
- `computed(fn)` est un signal en lecture seule de ce que `fn` retourne, calculé à la première lecture et de nouveau seulement une fois qu'un signal qu'il a lu a changé.
- `watch(source, fn)` exécute `fn(next, previous)` quand le signal, ou ce que la fonction `source` lit, change. Dans un composant, il s'arrête au démontage du composant ; ailleurs, il s'exécute à partir de maintenant. Il retourne un abonnement dont `remove()` l'arrête.
- `effect(fn)` ré-exécute `fn` chaque fois que ce qu'il a lu change.

## Mise en lot

Les écritures se mettent en lot d'elles-mêmes. Tout ce qu'un événement natif écrit atteint l'écran ensemble, en un seul lot hôte. Une écriture ailleurs (après un `await`, dans un timer) ouvre un lot qui se termine à la prochaine microtâche. Une lecture est toujours à jour : un `computed` lu juste après une écriture la voit.

## Signaux dans les props

Une prop accepte une valeur ou un signal (`Prop<T>`) : `opacity={level}` suit `level`, comme `opacity={level.value}` le fait, puisque le compilateur rend chaque expression JSX réactive. Une fonction dans une prop est toujours un gestionnaire, donc un thunk écrit à la main (`opacity={() => level.value}`) est une erreur de type : écrivez l'expression, ou dérivez un signal avec `computed(() => ...)`. Les enfants et le `when` de `Show` acceptent les signaux de la même façon.

Une lecture de `.value` dans le corps d'un composant, hors JSX et hors de toute fonction, ne voit que la première valeur, parce que le composant ne s'initialise qu'une fois. Le compilateur le signale avec le fichier et la ligne.

## Stores

`store(initial)` crée un objet ou un tableau dont chaque chemin est un signal :

```tsx
import { Pressable, Text, store } from 'kuito';

const shelf = store({ books: [{ id: 1, title: 'Dune', liked: false }] });

function Book() {
  return (
    <Pressable onPress={() => (shelf.books[0].liked = true)}>
      <Text>{shelf.books[0].liked ? '♥' : '♡'}</Text>
    </Pressable>
  );
}
```

- Une lecture à travers le store ne suit que ce chemin : le libellé ci-dessus suit `books[0].liked`, et une écriture dans `books[0].title` le laisse tranquille.
- Les méthodes de tableau (`push`, `splice`, `sort`) écrivent aussi à travers lui.
- Il enveloppe `initial` au lieu de le copier, donc les données restent simples. Écrivez à travers le store : un changement fait directement sur l'objet simple n'atteint personne.
- Les objets et tableaux simples à l'intérieur sont aussi des stores ; les instances de classe, les dates et les maps sont des valeurs.

## Props des composants

Un composant lit ses props comme des valeurs, comme en React : `props.show.name`. L'endroit où une prop est lue décide de ce qui se met à jour :

- Lue dans le JSX (`<Text>{props.count}</Text>`), elle reste réactive : le texte suit le signal derrière la prop.
- Lue dans le corps du composant ou destructurée (`function Label({ count })`), elle est lue une fois, au rendu du composant.

Lisez les props là où elles servent quand elles doivent suivre un signal.

## Identité des hooks

L'état d'un hook appartient à son slot, dont la clé est `<component path>:<kind>:<name>`, jamais sa position parmi les appels. Un hook affecté à une variable est nommé d'après elle (`const visits = signal(1)`) ; un hook affecté à rien est nommé par son ordinal parmi les hooks de sa sorte.

Donc ajouter un hook, réordonner les hooks ou en appeler un dans un `if` conserve l'état de tous les autres hooks à travers les Live Patches. Renommer une variable renomme son slot, qui repart de zéro. L'état d'un slot dure aussi longtemps que son instance de composant.

## En profondeur

[Réactivité](../../../../docs/reactivity.md) couvre comment un patch de source conserve les valeurs des expressions, les règles complètes de nommage des hooks et ce qui fait une instance de composant.
