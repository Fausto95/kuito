# Flux de contrôle

Une structure qui dépend de l'état — afficher un panneau, choisir un onglet —
utilise `Show`, `Switch`, `Match` et `For` de `kuito`, inspirés des
composants de Solid. Une expression enfant réactive
(`{open.value ? <Panel /> : null}`) fonctionne aussi.

```tsx
import { Show, Switch, Match } from 'kuito';

<Show when={user.value} fallback={<SignIn />}>
  {(user) => <Text>Hi {user.name}</Text>}
</Show>

<Switch fallback={<NotFound />}>
  <Match when={tab.value === 'home'}><Home /></Match>
  <Match when={tab.value === 'search'}><Search /></Match>
</Switch>
```

- `Show` rend ses enfants tant que `when` est vrai, sinon `fallback`. Un
  enfant unique sous forme de fonction de rappel reçoit la valeur vraie.
- `Switch` rend le premier `Match` dont `when` est vrai, sinon `fallback`.
  `Match` doit être un enfant direct de `Switch` ; ses enfants peuvent aussi
  être une fonction de rappel.
- `Switch` est du flux de contrôle. Le contrôle natif marche/arrêt est
  `Toggle` (le `Switch` de React Native), donc un même fichier peut utiliser
  les deux.

## For

`For` rend une ligne par élément de `each` (un tableau, un signal de tableau,
ou un tableau de [store](reactivity.md#stores)), pour les listes qui ne sont
pas virtualisées, comme quelques dizaines de lignes dans un `Scroll`. Une
longue liste a sa place dans `List` ([lists.md](lists.md)).

```tsx
import { For, Scroll, Text, store } from 'kuito';

const todo = store({ tasks: [{ title: 'Write', done: false }] });

<Scroll>
  <For each={todo.tasks} fallback={<Text>Nothing to do</Text>}>
    {(task, index) => <Text>{index.value + 1 + '. ' + task.title + (task.done ? ' ✓' : '')}</Text>}
  </For>
</Scroll>;
```

- Les lignes sont indexées par élément : un objet par son identité (les objets
  d'un store conservent la leur où qu'ils se déplacent), une chaîne ou un
  nombre par sa valeur, numérotée là où elle se répète. Un réordonnancement
  déplace les vues des lignes ; aucune vue n'est créée à nouveau.
- Une ligne est rendue une fois par élément. Quand `each` change, une ligne
  dont l'élément est resté renvoie l'arbre qu'elle a rendu, si bien que ses
  liaisons ne sont pas évaluées à nouveau ; `index` est un signal qui suit la
  position de la ligne.
- `fallback` est rendu tant que `each` est vide.
- Son unique enfant est la fonction qui rend une ligne.

## Comment la mise à jour se fait

Les conditions `when` et les expressions enfants réactives sont évaluées avec
suivi des dépendances pendant la construction du plan de vues. Chaque `Show`,
`Switch`, `For` et expression enfant réactive possède sa branche : quand un
signal que sa condition a lu change, seule cette branche est planifiée à
nouveau, dans une microtâche (plusieurs changements dans un même tick
partagent une seule re-planification), à partir des éléments que le module a
rendus en dernier. Le reste de l'écran n'est pas parcouru, ses liaisons ne
sont pas évaluées, et ses abonnements demeurent. Une branche à l'intérieur
d'une autre appartient au propriétaire le plus profond ; quand les deux
changent dans un même tick, la branche externe se re-planifie et entraîne la
branche interne avec elle. L'état des composants est conservé, les vues
retenues sont réutilisées, et seul ce que la branche a changé est démonté et
monté. Les vues démontées jouent leur effet `exit` ; les vues montées jouent
`enter` ([mouvement](motion.md)).

Un signal lu par une décision structurelle hors de tout propriétaire (le
`horizontal` d'un `Scroll`, une option de geste à la racine du module)
re-planifie tout le module, par le même chemin que Live Patch. De même pour une
branche qui ne peut pas se re-planifier seule : une branche dont le plan lève
une exception, ou, sur un hôte qui ne peut pas déplacer les vues, une branche
qui recréerait les frères qui la suivent.

Une instance de composant est sa place dans l'arbre, son composant et sa
`key`, comme en React. Une branche qui se démonte abandonne l'état de ses
instances et nettoie leur cycle de vie ; la réafficher monte de nouvelles
instances qui partent de leur état initial et exécutent `onMount` à nouveau.
Rendre un autre composant, ou le même avec une autre `key`, à la même place
monte aussi une nouvelle instance.

Les liaisons de propriétés (`opacity={count.value > 0 ? 1 : 0.5}`) restent à
grain fin et ne re-planifient jamais. Une re-planification échouée ne commite
rien — l'interface précédente demeure — et est signalée une seule fois par le
point d'erreur unique du runtime.
