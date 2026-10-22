# Fluxo de controlo

A estrutura que depende do estado — mostrar um painel, escolher um separador — usa
`Show`, `Switch`, `Match` e `For` de `kuito`, à semelhança dos componentes do Solid.
Uma expressão filha reativa (`{open.value ? <Panel /> : null}`) também funciona.

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

- `Show` renderiza os seus filhos enquanto `when` é truthy, caso contrário `fallback`. Um
  único filho callback recebe o valor truthy.
- `Switch` renderiza o primeiro `Match` cujo `when` é truthy, caso contrário
  `fallback`. `Match` tem de ser filho direto de `Switch`; os seus filhos também podem
  ser um callback.
- `Switch` é fluxo de controlo. O controlo nativo ligado/desligado é `Toggle`
  (o `Switch` do React Native), pelo que um ficheiro pode usar ambos.

## For

`For` renderiza uma linha por item de `each` (um array, um sinal de um, ou um array de
[store](reactivity.md#stores)), para listas que não são virtualizadas, como
umas dezenas de linhas num `Scroll`. Uma lista longa pertence a `List`
([lists.md](lists.md)).

```tsx
import { For, Scroll, Text, store } from 'kuito';

const todo = store({ tasks: [{ title: 'Write', done: false }] });

<Scroll>
  <For each={todo.tasks} fallback={<Text>Nothing to do</Text>}>
    {(task, index) => <Text>{index.value + 1 + '. ' + task.title + (task.done ? ' ✓' : '')}</Text>}
  </For>
</Scroll>;
```

- As linhas são identificadas por item: um objeto pela sua identidade (os objetos de uma store mantêm
  a sua onde quer que se movam), uma cadeia ou um número pelo seu valor, numerado onde
  se repete. Uma reordenação move as vistas das linhas; nenhuma vista é criada de novo.
- Uma linha renderiza uma vez por item. Quando `each` muda, uma linha cujo item se manteve
  devolve a árvore que renderizou, pelo que as suas ligações não são avaliadas de novo;
  `index` é um sinal que segue a posição da linha.
- `fallback` renderiza enquanto `each` está vazio.
- O seu único filho é a função que renderiza uma linha.

## Como atualiza

As condições `when` e as expressões filhas reativas são avaliadas com rastreio de
dependências enquanto o plano de vistas é construído. Cada `Show`, `Switch`, `For` e expressão
filha reativa é dona do seu ramo: quando um sinal que a sua condição leu muda, só
esse ramo é planeado de novo, numa microtarefa (várias alterações no mesmo tick partilham
um único replaneamento), a partir dos elementos que o módulo renderizou da última vez. O resto do
ecrã não é percorrido, as suas ligações não são avaliadas, e as suas subscrições
mantêm-se. Um ramo dentro de outro pertence ao dono mais interior; quando ambos mudam
no mesmo tick, o exterior replaneia e leva o interior consigo. O estado dos componentes
é mantido, as vistas retidas são reutilizadas, e só o que o ramo alterou é
desmontado e montado. As vistas desmontadas executam o seu efeito `exit`; as vistas montadas
executam `enter` ([movimento](motion.md)).

Um sinal lido por uma decisão estrutural fora de qualquer dono (o
`horizontal` de um `Scroll`, uma opção de gesto na raiz do módulo) replaneia o módulo inteiro,
pelo mesmo caminho que o Live Patch. O mesmo faz um ramo que não consegue replanear
sozinho: um cujo plano lança uma exceção, ou, num host que não consegue mover vistas, um que
recriaria os irmãos a seguir a ele.

Uma instância de componente é o seu lugar na árvore, o seu componente e a sua `key`, como
no React. Um ramo que desmonta descarta o estado das suas instâncias e limpa o seu
ciclo de vida; mostrá-lo de novo monta novas instâncias que partem do seu estado
inicial e correm `onMount` de novo. Renderizar outro componente, ou o mesmo
com outra `key`, no mesmo lugar monta também uma nova instância.

As ligações de propriedades (`opacity={count.value > 0 ? 1 : 0.5}`) mantêm-se granulares e nunca replaneiam. Um
replaneamento falhado não faz commit de nada — a UI anterior mantém-se — e é reportado uma vez
através do ponto único de tratamento de erros do runtime.
