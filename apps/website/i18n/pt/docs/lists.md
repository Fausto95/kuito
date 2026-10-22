# Listas nativas

`List` é virtualizada pela plataforma: uma `UICollectionView` no iOS e uma
`RecyclerView` no Android são donas do scroll, da reciclagem e de quais as
linhas que existem. O JavaScript renderiza uma linha só quando a lista nativa
a pede, e uma célula reciclada é religada pelo diff de patch normal em vez de
ser criada de novo. O scroll nunca espera pelo JavaScript.

```
List (src/ui/flat-list.tsx)          native List (Views/KuitoListView)
  keys as edits ────────────────────────▶  inserts, removes, moves rows
                                            picks a cell for each row near
  bind(cell, key) ◀────────────────────── the viewport (render-ahead window)
  renderCell: patch the cell's module ──▶  ListCell + row views, cellKey ack
  row signals: item, index, visible ────▶  one prop write per field write
                                            measures the row (its own layout
                                            root), shows it, keeps its size
```

## Quem é dono de quê

- **A lista nativa** é dona das células e decide que célula mostra que chave.
  Para uma linha, reutiliza a célula que já tem essa chave, senão a célula
  livre menos recentemente usada, senão uma nova. Mantém uma célula para cada
  linha até um ecrã à frente da viewport (meio ecrã atrás) e oito
  sobressalentes fora do ecrã, para que as linhas sejam renderizadas antes de
  entrarem no ecrã e voltar um pouco atrás no scroll não precise de
  JavaScript nenhum.
- **O JavaScript** renderiza uma linha na célula que lhe é pedida. Cada célula
  é um módulo próprio (`src/runtime/lists.ts`) cuja raiz é a vista
  `ListCell`. Religar uma célula a outra chave aplica um patch a esse módulo:
  as mesmas vistas, props diferenciadas. Os componentes da linha começam de
  novo para o novo item (estado, hooks de montagem, tasks), como no React
  Native, onde o estado de uma linha pertence ao seu item.
  Quando novos dados retiram a chave de uma linha ligada, a sua célula não
  renderiza nada: a lista nativa pode manter essa célula e voltar a
  mostrá-la, sem lhe ser pedido, se a chave regressar, e novos dados
  renderizam a linha de volta nela.
- **Layout**: cada linha é uma raiz de layout no motor de flexbox partilhado,
  tão larga como a sua coluna (uma lista vertical) ou como o seu conteúdo
  (uma lista horizontal). Os tamanhos medidos ficam em cache por chave, por
  isso uma linha já vista volta com o seu tamanho real. Uma linha ainda não
  renderizada toma o seu tamanho em cache, `estimatedItemSize`, ou a média
  das linhas medidas, e mostra-se em branco até chegar.

## Stores e linhas de granularidade fina

Uma linha é reativa, não memoizada. Cada linha ligada guarda sinais próprios
(`src/ui/flat-list.tsx`): o seu item, o seu índice, se é a última linha e se
está no ecrã. Novos dados movem cada linha para o lugar do seu item,
escrevendo esses sinais, e só os bindings que leem um que mudou correm de
novo: uma linha cujo item é o mesmo objeto e que nunca lê `index` não
renderiza nada quando são inseridas linhas acima dela.

Sobre um array de [store](reactivity.md#stores), os itens são os objetos do
store, por isso uma escrita num campo nunca muda o item:

```tsx
const shelf = store({ books: [] as Book[] });

<List
  data={shelf.books}
  renderItem={({ item, visible }) => (
    <Pressable onPress={() => (item.liked = !item.liked)}>
      <Text>{item.title}</Text>
      <Text>{item.liked ? '♥' : '♡'}</Text>
      <Spinner animating={visible.value} />
    </Pressable>
  )}
/>;
```

- `items[3].liked = true` chega ao único binding que o lê: uma escrita de
  prop numa célula, nenhuma linha re-renderizada e nenhuma chave enviada.
- `push`, `splice` e `sort` enviam à lista as edições às suas chaves (ver
  [Chaves](#keys)); as linhas mantêm as suas células.
- Um item sem `key` nem `id` é identificado pela sua identidade no store, por
  isso mantém a sua chave para onde quer que se mova. Substituir um índice
  por outro objeto é um item novo.

`visible` é um sinal por linha, alimentado pelo intervalo `viewable` nativo e
pelo limiar `viewability`: inicie um vídeo ou um fetch enquanto a linha está
no ecrã, e pare-o quando ela sair. `onViewableChange` reporta o mesmo
intervalo que os viewability tokens do React Native. Reportar o intervalo
custa trabalho à lista nativa em cada scroll, por isso só começa quando uma
linha lê `visible` ou `onViewableChange` é definido.

## Secções e cabeçalhos fixos

`List` tem secções sem um segundo tipo de lista: `sectionKey` nomeia a secção
de cada item, e cada sequência de itens com a mesma secção recebe uma linha
de cabeçalho que `renderSection` renderiza, dada a secção e o seu primeiro
item. `stickySections` mantém o cabeçalho de uma secção no topo da lista
enquanto a sua secção passa por baixo dele; o cabeçalho seguinte empurra-o
para cima quando chega.

```tsx
<List
  data={library.songs}
  sectionKey={(song) => song.album}
  renderSection={({ section }) => <Text class={css.albumTitle}>{section}</Text>}
  stickySections
  renderItem={({ item }) => <SongRow song={item} />}
/>
```

- Os itens de uma secção têm de estar seguidos em `data`: uma secção que
  apareça duas vezes é um erro.
- As linhas de cabeçalho ocupam todas as colunas de uma grelha, e nenhum
  separador se segue ao último item de uma secção.
- `sectionKey` é lido como `itemKey`: sobre um array de store, um item cuja
  secção muda move-se para a sua nova secção.
- Os cabeçalhos fixos precisam de uma lista vertical não invertida; qualquer
  outra coisa é um erro. No iOS, o layout da lista prende a linha do
  cabeçalho no lugar; no Android, uma overlay por cima da RecyclerView aloja
  a célula do cabeçalho enquanto este está preso. Em ambos os casos o
  cabeçalho é a linha que o JavaScript renderizou, com os seus handlers.

## Listas curtas: For

Uma lista de algumas dezenas de linhas dentro de um `Scroll` não precisa de
virtualização: use [`For`](control-flow.md#for). Renderiza todas as linhas,
identificadas por item, e uma reordenação move as vistas das linhas em vez
de planear o ecrã de novo. Sobre um array de store recebe as mesmas
atualizações de uma prop por escrita de campo que `List`.

## Chaves

As chaves de uma lista atravessam a fronteira do host como edições às chaves
enviadas da última vez, nunca como o array inteiro outra vez: um append é uma
inserção, uma remoção é uma remoção, seja qual for o comprimento da lista. O
kernel (`src/runtime/key-diff.ts`) compara as chaves com as que enviou e
escreve, por ordem:

1. uma remoção para cada chave que saiu, no seu índice depois de feitas as
   remoções anteriores;
2. um movimento para cada chave que mudou de lugar, os menos possíveis que
   cheguem à nova ordem: as chaves numa sequência mais longa já ordenada
   ficam, como quando o kernel reordena os filhos de uma vista
   (`src/runtime/reconcile.ts`);
3. uma inserção para cada chave nova, no seu índice final, da primeira à
   última.

Cada edição aplica-se às chaves que as edições anteriores deixaram; o índice
de um movimento conta depois de a chave ter saído do seu lugar. As primeiras
chaves são todas inserções no fim, e null limpa a lista.

Os renderers aplicam um diff por inteiro (`Views/KuitoListKeys`): uma
remoção tem de nomear a chave no seu índice, um movimento uma chave que a
lista tem, uma inserção uma chave que ela não tem e um índice dentro da
lista. Uma edição que não encaixe lança `unsupportedValue` em `keys` e deixa
as chaves como estavam; uma chave inserida duas vezes é o mesmo erro, já que
as chaves têm de ser únicas. A lista volta então a indexar as suas chaves,
linhas fixas incluídas, para que um cabeçalho fixo fique preso no novo lugar
da sua chave. No iOS, a diffable data source anima a alteração; no Android, o
adapter é informado de cada inserção, remoção e movimento à medida que
acontece, sem passagem de `DiffUtil`. As primeiras linhas e uma lista
esvaziada carregam de imediato.

## Protocolo do host

Tipos nativos: `List`, `HorizontalList` (o eixo é fixado quando a vista é
criada, como no Scroll) e `ListCell`.

| Prop de List                         | Valor                                                                                                                                                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keys`                               | Edições às chaves das linhas enviadas da última vez (ver [Chaves](#keys)); as chaves são únicas, e as alterações animam                                                                                                                   |
| `stickyKeys`                         | Array JSON das linhas que ficam presas ao topo enquanto a sua secção passa (só `List`)                                                                                                                                                    |
| `spanningKeys`                       | Array JSON das linhas que ocupam todas as colunas (header, footer, empty, secções)                                                                                                                                                        |
| `numColumns`                         | Colunas de uma lista vertical                                                                                                                                                                                                             |
| `gap`, `rowGap`, `columnGap`         | Pontos entre linhas e entre colunas, como num contentor flex: `rowGap` entre as linhas de uma lista vertical, `columnGap` entre as colunas de uma grelha e as linhas de uma lista horizontal; `gap` define ambos (também props de layout) |
| `inverted`                           | Primeira linha no fim; a lista e cada linha são invertidas                                                                                                                                                                                |
| `estimatedItemSize`                  | Comprimento de uma linha ainda não medida                                                                                                                                                                                                 |
| `initialScrollKey`                   | Linha a mostrar primeiro, assim que exista                                                                                                                                                                                                |
| `scrollTo`                           | Um pedido, em JSON: `{ key, animated, viewPosition, viewOffset }`, `{ offset, animated }` ou `{ end, animated }`, numerado por `request`                                                                                                  |
| `emitsViewable`, `viewableThreshold` | Reportar as linhas visíveis; fração de uma linha que conta                                                                                                                                                                                |
| props de scroll                      | `emitsScroll`, `scrollInterval`, `reachEndThreshold`, `refreshable`, `refreshing`, `scrollbar`, `keyboard`, como no Scroll                                                                                                                |

| Prop de ListCell | Valor                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| `cellKey`        | A chave que o JavaScript renderizou na célula; a linha mostra-se quando coincide com a chave que a lista pediu |

| Evento de List      | Payload                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `bind`              | `{ cell, key }`: renderizar `key` em `cell` (`<list>:cell-<n>`), criando a ListCell na primeira vez |
| `viewable`          | `{ first, last }`: chaves da primeira e da última linha visíveis                                    |
| `reachend`          | Uma vez por contagem de linhas                                                                      |
| `scroll`, `refresh` | Como no Scroll                                                                                      |

As linhas de header, footer e empty são linhas com as chaves `#header`,
`#footer` e `#empty`, e o cabeçalho de uma secção é `#section:<section>`; uma
chave de item não pode usar nenhuma delas. Quando uma lista é removida, o
kernel remove primeiro as suas células (e as suas linhas).

## Como evita os problemas habituais das listas

- **Áreas em branco ao fazer scroll depressa**: as linhas um ecrã à frente
  são ligadas antes de aparecerem, e uma linha mantém o seu tamanho enquanto
  espera, por isso nada salta. Um fling muito rápido ainda pode ultrapassar o
  JavaScript; essas linhas mostram-se em branco durante um ou dois frames,
  nunca com conteúdo desatualizado.
- **`onReachEnd` a disparar repetidamente**: dispara uma vez por contagem de
  linhas, não por comprimento de conteúdo, por isso linhas a medirem-se a si
  próprias não o podem voltar a disparar.
- **`getItemLayout` para scroll-to-index**: a lista faz scroll até à posição
  estimada da linha e aterra nela exatamente à medida que as linhas à sua
  volta são medidas. Um salto animado distante corta para um ecrã antes do
  destino e anima o resto.
- **Linhas escondidas atrás do teclado**: uma lista vertical afasta o seu
  conteúdo da parte que o teclado cobre, para além do seu padding, e faz
  scroll de uma entrada focada numa linha para cima dele, como o Scroll faz
  (docs/keyboard.md). Sem `KeyboardAvoidingView` à volta.
- **Re-renderizar todas as linhas quando dados exteriores mudam**: só as
  linhas ligadas (as que estão no ecrã ou perto dele) renderizam de novo,
  quando o seu item mudou, e um sinal ou caminho de store lido em
  `renderItem` re-renderiza apenas as partes das linhas que o leem.
