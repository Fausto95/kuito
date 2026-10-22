# Réactivité

## Signaux

Un signal contient une valeur qui change. Le JSX qui la lit la suit, sans
ré-exécuter le composant :

```tsx
import { Pressable, Text, computed, signal, watch } from 'kuito';

const theme = signal<'light' | 'dark'>('light'); // shared by every component

function Counter() {
  const count = signal(0); // this component's own, kept across Live Patches
  const doubled = computed(() => count.value * 2);

  watch(count, (next, previous) => console.log(previous, '→', next));

  return (
    <Pressable
      onPress={() => {
        count.value++;
        theme.value = 'dark'; // one update with the count, no batch() needed
      }}
    >
      <Text opacity={count.value > 0 ? 1 : 0.5}>{doubled}</Text>
    </Pressable>
  );
}
```

- `signal(initial)` créé pendant qu'un composant s'initialise appartient au
  slot de ce composant (voir ci-dessous) ; créé n'importe où ailleurs, c'est un
  signal autonome.
- `computed(fn)` est un signal en lecture seule de ce que `fn` renvoie, calculé
  à la première lecture puis de nouveau seulement lorsqu'un signal qu'il a lu
  a changé.
- `watch(source, fn)` exécute `fn(next, previous)` lorsque le signal, ou ce que
  la fonction `source` lit, change. Dans un composant, il s'arrête quand le
  composant est démonté ; ailleurs, il s'exécute désormais en permanence. Dans
  les deux cas, il renvoie une souscription dont `remove()` l'arrête.
- `effect(fn)` ré-exécute `fn` chaque fois que ce qu'il a lu change.

Les écritures se regroupent d'elles-mêmes. Tout ce qu'un événement natif écrit
atteint l'écran ensemble, en un seul lot hôte. Une écriture faite n'importe où
ailleurs (après un `await`, dans un timer) ouvre un lot qui se termine à la
microtâche suivante, de sorte que les écritures faites d'ici là partent
ensemble aussi. Une lecture est toujours à jour : un `computed` lu juste après
une écriture la voit. Ce qui s'exécute plus tard n'est que ce qui écoute : les
liaisons, `watch` et `effect`.

Une prop accepte une valeur ou un signal (`Prop<T>`) : `opacity={level}` suit
`level`, tout comme `opacity={level.value}`, puisque le compilateur rend chaque
expression JSX réactive. Une fonction dans une prop est toujours un
gestionnaire, donc un thunk écrit à la main (`opacity={() => level.value}`)
est une erreur de type : écrivez l'expression, ou dérivez un signal avec
`computed(() => …)`. Les enfants et le `when` de `Show` acceptent les signaux
de la même manière.

Une lecture de `.value` dans le corps d'un composant, hors du JSX et hors de
toute fonction, ne voit que la première valeur, car le composant ne
s'initialise qu'une fois. Le compilateur le signale par un avertissement avec
le fichier et la ligne, et la CLI affiche cet avertissement.

## Stores

`store(initial)` crée un objet ou un tableau dont chaque chemin est un signal,
à la manière des stores mutables de Solid :

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

- Une lecture à travers le store ne suit que ce chemin-là : le libellé
  ci-dessus suit `books[0].liked`, et une écriture dans `books[0].title` le
  laisse intact.
- Une écriture à travers le store notifie les liaisons qui ont lu ce qui a
  changé, regroupée comme toute écriture de signal. Les méthodes de tableau
  (`push`, `splice`, `sort`) écrivent aussi à travers lui : une expression qui
  a lu `books.length` ou qui a parcouru le tableau les suit, et `Object.keys`
  et `in` suivent les clés qui apparaissent et disparaissent.
- Il enveloppe `initial` au lieu de le copier, et chaque objet a un seul
  proxy : `shelf.books[0] === shelf.books[0]`. Un objet de store affecté à un
  autre chemin est stocké comme son objet brut, de sorte que les données
  restent brutes (il se `JSON.stringify` tel quel). Écrivez à travers le
  store : une modification faite directement sur l'objet brut n'atteint
  personne.
- Les objets et tableaux bruts qu'il contient sont aussi des stores ; les
  instances de classes, les dates et les maps sont des valeurs.
- Créé pendant qu'un composant s'initialise, il appartient au slot de ce
  composant et persiste à travers les Live Patches, comme `signal()` (le
  compilateur le nomme).

## Rafraîchissement granulaire et identité des expressions

Kuito distingue les **mises à jour de signaux** des **patches de source**.

- Les mises à jour de signaux modifient les propriétés natives dépendantes sans
  ré-exécuter les composants.
- Un patch de source reconstruit actuellement l'arbre de descripteurs des
  composants afin de découvrir les modifications structurelles. Ce n'est pas
  encore à grain fin au niveau des composants.
- Pendant un patch de source, les valeurs des expressions JSX marquées par le
  compilateur sont conservées lorsque le hash de l'expression, le texte
  statique englobant et l'identifiant de vue stable concordent. L'ancienne
  valeur native est réutilisée ; une nouvelle closure reçoit les changements
  de signaux ultérieurs.
- Les expressions dont la source change sont réévaluées. Cela empêche
  précisément <Text>Hey{Math.random()}</Text> de changer simplement parce que
  le libellé d'un Button distinct a été modifié.
- Un nouveau rendu (un signal structurel replanifie le module) réévalue les
  expressions d'un composant ré-exécuté : la même source s'exécute avec
  d'autres props. Un composant qui ne s'est pas ré-exécuté renvoie son arbre
  précédent, et une prop ou un libellé dont le thunk est le même objet garde
  sa valeur et les signaux qu'il a lus, sans réévaluation, dans chaque plan.
  Les souscriptions persistent à travers les plans : une liaison conservée les
  garde, et une liaison réévaluée ne souscrit qu'aux signaux qu'elle lit
  nouvellement et relâche ceux qu'elle a cessé de lire. Une prop objet
  reconstruite avec des données égales (un style, les gestes) n'est pas
  renvoyée : le noyau garde le JSON sous lequel les props objet de chaque vue
  ont été envoyées en dernier.

Il s'agit d'une **atténuation ciblée, pas d'une invalidation de source
purement à grain fin** : les fonctions des composants s'exécutent encore
pendant la préparation d'un patch, et le code dans le corps des composants
peut avoir des effets de bord. Les changements de valeurs non réactives
capturées par closure, d'entrées des composants parents, de closures lexicales
et de dépendances qui changent dynamiquement peuvent ne pas être reflétés si
le texte de l'expression est inchangé. Travaux futurs : graphes de dépendances
des composants générés par le compilateur, invalidation complète des props par
instance, re-suivi réactif des dépendances dynamiques, et reconstruction sûre
des sous-arbres. Évitez de faire reposer la correction de l'application sur
des expressions de rendu impures.

## Identité des hooks

L'état d'un hook appartient à son slot, et la clé d'un slot est
`<chemin du composant>:<genre>:<nom>`, jamais sa position parmi les appels. Le
compilateur passe à chaque hook son nom en dernier argument :

- un hook affecté à une variable est nommé d'après elle : `const visits = signal(1)`
  devient `signal(1, "visits")`, et de même pour `store`, `motion`, `ref`, `task`
  et `resource` ;
- un hook affecté à rien (`onMount`, `onCleanup`, `effect`, `watch`, ou un
  `signal(0)` nu) est nommé par son ordinal parmi les hooks de son genre dans
  sa fonction, dans l'ordre du source : `effect(fn, "#2")` ;
- un nom réclamé deux fois dans un même rendu (un helper appelant `signal()`
  deux fois pour la même variable) prend `name#2`, `name#3`, dans l'ordre
  d'appel. Le code que le compilateur n'a pas vu est nommé par ordre d'appel de
  la même manière.

`task` et `resource` partagent un même genre, donc leurs noms doivent différer
l'un de l'autre ; chaque autre genre a ses propres noms.

Ainsi, ajouter un hook, réordonner des hooks ou en appeler un dans un `if`
conserve l'état de tous les autres hooks : Live Patch garde les slots dont les
clés survivent, démarre les nouveaux depuis leurs valeurs initiales et dispose
ceux qui ont été retirés (un `effect` ou un `onMount` retiré exécute son
nettoyage, une valeur `motion` retirée est libérée sur les deux threads), et un
avertissement sur l'appareil nomme les hooks apparus et disparus. Un hook dans
un `if` ne détient son slot que tant que la branche s'exécute : quand la
condition devient fausse, son état est libéré, et il repart de zéro quand la
condition redevient vraie. Renommer une variable renomme son slot, qui repart
de zéro.

L'état d'un slot dure aussi longtemps que son instance de composant : une
instance qui quitte l'arbre libère chaque slot qu'elle détenait, et une
instance qui revient repart des valeurs initiales. Une instance, c'est sa
place, son composant et sa `key` (`incremental.md`) : rendre un autre composant
ou une autre key à la même place est une nouvelle instance, même à l'intérieur
d'une expression comme `{flag ? <A /> : <B />}`.

## Props des composants

Un composant lit ses props comme des valeurs, comme en React : `props.show.name`.
Derrière chaque prop, le compilateur passe l'expression de l'attribut, et le
noyau l'expose comme un getter, comme le fait Solid. Donc l'endroit où une prop
est lue décide de ce qui se met à jour :

- Lue à l'intérieur du JSX (`<Text>{props.count}</Text>`), elle reste
  réactive : le texte suit le signal derrière la prop.
- Lue dans le corps du composant ou destructurée
  (`function Label({ count })`), elle est lue une seule fois, au rendu du
  composant.

Lisez les props là où elles sont utilisées quand elles doivent suivre un signal.
