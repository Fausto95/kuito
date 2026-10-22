# Fluxo de controlo

A estrutura que depende do estado, mostrar um painel ou escolher um separador, usa `Show`, `Switch`, `Match` e `For` de `kuito`. Uma expressão filha reativa (`{open.value ? <Panel /> : null}`) também funciona.

## Show

`Show` renderiza os seus filhos enquanto `when` é truthy, caso contrário `fallback`. Um único filho callback recebe o valor truthy.

```tsx
import { Show } from 'kuito';

<Show when={user.value} fallback={<SignIn />}>
  {(user) => <Text>Hi {user.name}</Text>}
</Show>;
```

## Switch e Match

`Switch` renderiza o primeiro `Match` cujo `when` é truthy, caso contrário `fallback`. `Match` tem de ser filho direto de `Switch`; os seus filhos também podem ser um callback. `Switch` é fluxo de controlo: o controlo nativo ligado/desligado é `Toggle`, pelo que um ficheiro pode usar ambos.

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

`For` renderiza uma linha por item de `each` (um array, um sinal de um, ou um array de [store](../../../../docs/reactivity.md#stores)), para listas que não são virtualizadas, como umas dezenas de linhas num `Scroll`. Uma lista longa pertence a [`List`](../../../../docs/lists.md). O seu único filho é a função que renderiza uma linha; `fallback` renderiza enquanto `each` está vazio.

```tsx
import { For, Scroll, Text, store } from 'kuito';

const todo = store({ tasks: [{ title: 'Write', done: false }] });

<Scroll>
  <For each={todo.tasks} fallback={<Text>Nothing to do</Text>}>
    {(task, index) => <Text>{index.value + 1 + '. ' + task.title}</Text>}
  </For>
</Scroll>;
```

- As linhas são identificadas pelo item: um objeto pela sua identidade, uma string ou um número pelo seu valor. Uma reordenação move as vistas das linhas; nenhuma vista é criada de novo.
- Uma linha renderiza uma vez por item. Quando `each` muda, uma linha cujo item se manteve devolve a árvore que renderizou; `index` é um sinal que segue a posição da linha.

## Como se atualiza

Cada `Show`, `Switch`, `For` e expressão filha reativa possui o seu ramo: quando um sinal que a sua condição leu muda, só esse ramo é planeado de novo, num microtask. O resto do ecrã não é percorrido, os seus bindings não são avaliados, e as suas subscrições mantêm-se. O estado dos componentes é mantido, as vistas retidas são reutilizadas, e só o que o ramo mudou é desmontado e montado.

Um ramo que desmonta perde o estado das suas instâncias; mostrá-lo de novo monta instâncias novas que partem do seu estado inicial e correm `onMount` outra vez. Os bindings de propriedades (`opacity={count.value > 0 ? 1 : 0.5}`) mantêm-se granulares e nunca replaneiam. Um replaneamento falhado não faz commit de nada: a UI anterior permanece.

## Em profundidade

[Fluxo de controlo](../../../../docs/control-flow.md) cobre a posse de ramos aninhados, o que replaneia o módulo inteiro, e a identidade dos componentes.
