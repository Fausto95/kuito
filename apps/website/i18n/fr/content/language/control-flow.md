# Flux de contrôle

Une structure qui dépend de l'état, afficher un panneau ou choisir un onglet, utilise `Show`, `Switch`, `Match` et `For` de `kuito`. Une expression enfant réactive (`{open.value ? <Panel /> : null}`) marche aussi.

## Show

`Show` rend ses enfants tant que `when` est truthy, sinon `fallback`. Un enfant callback unique reçoit la valeur truthy.

```tsx
import { Show } from 'kuito';

<Show when={user.value} fallback={<SignIn />}>
  {(user) => <Text>Hi {user.name}</Text>}
</Show>;
```

## Switch et Match

`Switch` rend le premier `Match` dont `when` est truthy, sinon `fallback`. `Match` doit être un enfant direct de `Switch` ; ses enfants peuvent aussi être un callback. `Switch` est du flux de contrôle : le contrôle natif marche/arrêt est `Toggle`, donc un même fichier peut utiliser les deux.

```tsx
import { Switch, Match } from 'kuito';

<Switch fallback={<NotFound />}>
  <Match when={tab.value === 'home'}>
    <Home />
  </Match>
  <Match when={tab.value === 'search'}>
    <Search />
  </Match>
</Switch>;
```

## For

`For` rend une ligne par élément de `each` (un tableau, un signal qui en contient un, ou un tableau de [store](../../../../docs/reactivity.md#stores)), pour les listes qui ne sont pas virtualisées, comme quelques dizaines de lignes dans un `Scroll`. Une longue liste va dans [`List`](../../../../docs/lists.md). Son unique enfant est la fonction qui rend une ligne ; `fallback` est rendu tant que `each` est vide.

```tsx
import { For, Scroll, Text, store } from 'kuito';

const todo = store({ tasks: [{ title: 'Write', done: false }] });

<Scroll>
  <For each={todo.tasks} fallback={<Text>Nothing to do</Text>}>
    {(task, index) => <Text>{index.value + 1 + '. ' + task.title}</Text>}
  </For>
</Scroll>;
```

- Les lignes sont identifiées par élément : un objet par son identité, une chaîne ou un nombre par sa valeur. Un réordonnancement déplace les vues des lignes ; aucune vue n'est recréée.
- Une ligne est rendue une fois par élément. Quand `each` change, une ligne dont l'élément est resté renvoie l'arbre qu'elle a rendu ; `index` est un signal qui suit la position de la ligne.

## Comment la mise à jour se fait

Chaque `Show`, `Switch`, `For` et expression enfant réactive possède sa branche : quand un signal que sa condition a lu change, seule cette branche est planifiée à nouveau, dans une microtâche. Le reste de l'écran n'est pas parcouru, ses liaisons ne sont pas évaluées, et ses abonnements demeurent. L'état des composants est conservé, les vues retenues sont réutilisées, et seul ce que la branche a changé est démonté et monté.

Une branche qui se démonte perd l'état de ses instances ; l'afficher à nouveau monte de nouvelles instances qui partent de leur état initial et exécutent `onMount` à nouveau. Les liaisons de propriété (`opacity={count.value > 0 ? 1 : 0.5}`) restent à grain fin et ne se replanifient jamais. Une replanification qui échoue ne committe rien : l'UI précédente demeure.

## En profondeur

[Flux de contrôle](../../../../docs/control-flow.md) couvre la possession des branches imbriquées, ce qui replanifie le module entier, et l'identité des composants.
