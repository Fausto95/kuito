# Listas

`List` é virtualizada pela plataforma: uma `UICollectionView` no iOS e uma `RecyclerView` no Android são donas do scroll, da reciclagem e de quais as linhas que existem. O JavaScript renderiza uma linha só quando a lista nativa a pede, e o scroll nunca espera pelo JavaScript.

## Quem é dono de quê

- **A lista nativa** é dona das células e decide que célula mostra que chave. Mantém uma célula para cada linha até um ecrã à frente da viewport e oito sobressalentes fora do ecrã, para que as linhas sejam renderizadas antes de entrarem no ecrã.
- **O JavaScript** renderiza uma linha na célula que lhe é pedida. Religar uma célula a outra chave aplica-lhe um patch: as mesmas vistas, props diferenciadas. Os componentes da linha começam de novo para o novo item.
- **Layout**: cada linha é uma raiz de layout, tão larga como a sua coluna (uma lista vertical) ou como o seu conteúdo (uma lista horizontal). Os tamanhos medidos ficam em cache por chave. Uma linha ainda não renderizada toma o seu tamanho em cache, `estimatedItemSize`, ou a média das linhas medidas.

## Stores e linhas de granularidade fina

Uma linha é reativa, não memoizada. Cada linha ligada guarda sinais próprios: o seu item, o seu índice, se é a última linha e se está no ecrã. Só os bindings que leem um que mudou correm de novo.

Sobre um array de [store](../../../../docs/reactivity.md#stores), os itens são os objetos do store, por isso uma escrita num campo nunca muda o item:

```tsx
const shelf = store({ books: [] as Book[] });

<List
  data={shelf.books}
  renderItem={({ item, visible }) => (
    <Pressable onPress={() => (item.liked = !item.liked)}>
      <Text>{item.title}</Text>
      <Spinner animating={visible.value} />
    </Pressable>
  )}
/>;
```

- `items[3].liked = true` chega ao único binding que o lê: uma escrita de prop numa célula, nenhuma linha re-renderizada.
- `push`, `splice` e `sort` enviam à lista as edições às suas chaves; as linhas mantêm as suas células.
- Um item sem `key` nem `id` é identificado pela sua identidade no store. Substituir um índice por outro objeto é um item novo.

`visible` é um sinal por linha, alimentado pelo intervalo visível nativo e pelo limiar `viewability`: inicie um vídeo ou um fetch enquanto a linha está no ecrã, e pare-o quando sai. `onViewableChange` reporta o mesmo intervalo.

## Secções e cabeçalhos fixos

`sectionKey` nomeia a secção de cada item, e cada sequência de itens com a mesma secção recebe uma linha de cabeçalho que `renderSection` renderiza. `stickySections` mantém o cabeçalho de uma secção no topo da lista enquanto a sua secção desliza por baixo dele.

```tsx
<List
  data={library.songs}
  sectionKey={(song) => song.album}
  renderSection={({ section }) => <Text class={css.albumTitle}>{section}</Text>}
  stickySections
  renderItem={({ item }) => <SongRow song={item} />}
/>
```

- Os itens de uma secção têm de estar juntos em `data`: uma secção que aparece duas vezes é um erro.
- As linhas de cabeçalho ocupam todas as colunas de uma grelha, e nenhum separador se segue ao último item de uma secção.
- Os cabeçalhos fixos precisam de uma lista vertical não invertida; qualquer outra coisa é um erro.

## Listas curtas: `For`

Uma lista de algumas dezenas de linhas dentro de um `Scroll` não precisa de virtualização: use [`For`](../../../../docs/control-flow.md#for). Renderiza todas as linhas, identificadas pelo item, e uma reordenação move as vistas das linhas em vez de planear o ecrã de novo. Sobre um array de store recebe as mesmas atualizações de uma prop por escrita de campo que a `List`.

## Os problemas habituais das listas

- **Áreas em branco ao fazer scroll depressa**: as linhas um ecrã à frente são ligadas antes de aparecerem, e uma linha mantém o seu tamanho enquanto espera.
- **`onReachEnd` a disparar repetidamente**: dispara uma vez por contagem de linhas, não por comprimento de conteúdo.
- **Linhas escondidas atrás do teclado**: uma lista vertical recua o seu conteúdo pela parte que o teclado cobre e faz scroll de um campo focado numa linha para cima dele. Sem `KeyboardAvoidingView` à volta.
- **Re-renderizar todas as linhas quando os dados mudam**: só as linhas ligadas renderizam de novo, quando o seu item mudou.

## Em profundidade

[Listas nativas](../../../../docs/lists.md) cobre o fluxo de ligação das células, como as chaves atravessam como edições, as chaves de linha reservadas e o protocolo do host.
