# Primitivas

As primitivas têm o nome do que dispõem ou fazem, e as suas props usam nomes
CSS onde o CSS tem o conceito ([nomenclatura](naming.md)).

As props aceitam escalares ou quaisquer dados JSON: objetos, arrays
(`edges={['top']}`) e combinações aninhadas atravessam para a vista nativa
como JSON. Funções e instâncias de classes não podem, a nenhuma profundidade.

## SafeArea

Um VStack com padding na parte dele que o sistema cobre: barra de estado,
notch ou Dynamic Island, indicador de início, barra de navegação. A aplicação
desenha de margem a margem, pelo que os fundos passam por baixo dessas áreas
enquanto a SafeArea mantém o conteúdo desimpedido.

```tsx
<Scroll backgroundColor="#0b1020">
  <SafeArea edges={['top']} padding={20}>
    <Text>Header</Text>
  </SafeArea>
</Scroll>
```

<!-- SafeArea props: generated from src/protocol/manifest.ts -->

| Prop    | Significado                                                                            |
| ------- | -------------------------------------------------------------------------------------- |
| `edges` | Quais de `top`, `right`, `bottom`, `left` recebem padding; os quatro por predefinição. |

<!-- end of generated props -->

- **Só a sobreposição conta**, como na SafeArea nativa do
  react-native-safe-area-context: uma SafeArea a meio do ecrã não recebe
  inset nenhum, e uma no fundo recebe exatamente a altura do indicador de
  início.
- O inset soma-se ao `padding` da própria vista.
- Os insets acompanham a rotação e as alterações das barras do sistema.

## Sheet

Uma bottom sheet nativa: `UISheetPresentationController` no iOS,
`BottomSheetDialog` do Material no Android. Os gestos da plataforma, a
passagem do scroll para a expansão, a acessibilidade e o fecho por retroceder
ou tocar no fundo vêm incluídos. Os seus filhos são vistas Kuito normais,
dispostas pelo motor partilhado dentro da sheet.

```tsx
<Sheet
  open={queueOpen.value}
  snapPoints={['content', '90%']}
  onClose={() => (queueOpen.value = false)}
  backgroundColor="#111827"
  padding={24}
>
  <Text>Up next</Text>
</Sheet>
```

<!-- Sheet props: generated from src/protocol/manifest.ts -->

| Prop           | Significado                                                                               |
| -------------- | ----------------------------------------------------------------------------------------- |
| `open`         | Mostra a sheet. Controlada, como o Modal do React Native.                                 |
| `onClose`      | O utilizador fechou-a (deslizar, fundo ou retroceder); volte a pôr `open` a false.        |
| `snapPoints`   | Alturas de repouso, da menor para a maior: pontos, `'50%'` ou `'content'` (predefinição). |
| `onSnap`       | `{ index }` do snap point em que a sheet assentou.                                        |
| `grabber`      | A pega de arrasto; mostrada por predefinição.                                             |
| `dismissible`  | Se deslizar para baixo ou tocar fora a fecha; true por predefinição.                      |
| `borderRadius` | O raio dos cantos da sheet.                                                               |

<!-- end of generated props -->

- **Respeita a área segura.** O conteúdo mantém-se afastado do indicador de
  início, da barra de navegação e, em paisagem, dos lados do ecrã; o padding
  soma-se a isso. `'content'` dimensiona a sheet pelos seus filhos mais esse
  inset.
- As props de estilo (fundo, padding, gap) aplicam-se dentro da sheet.
- A sheet do Android repousa em até três alturas (recolhida, meio expandida e
  expandida), pelo que, aí, no máximo três snap points têm efeito.
- No iOS 26 e posteriores, o sistema desenha as sheets a flutuar, afastadas
  das margens do ecrã.

## Pressable

Um contentor (disposto como um `VStack`) que responde a toques.

```tsx
<Pressable
  onPress={open}
  onLongPress={showMenu}
  pressedOpacity={0.7}
  pressedScale={0.97}
  haptic="light"
>
  <Text>Open</Text>
</Pressable>
```

<!-- Pressable props: generated from src/protocol/manifest.ts -->

| Prop                          | Significado                                                       |
| ----------------------------- | ----------------------------------------------------------------- |
| `onPress`                     | Um toque concluído. Não é chamado quando um toque longo disparou. |
| `onPressStart` / `onPressEnd` | Início / fim ou cancelamento do toque.                            |
| `onLongPress`                 | Mantido durante `longPressDuration` ms (500 por predefinição).    |
| `disabled`                    | Ignora os toques.                                                 |
| `hitArea`                     | Margem tocável extra, em pontos.                                  |
| `pressedOpacity` _(Kuito)_    | Opacidade enquanto premido, como `TouchableOpacity`. 1 = nenhuma. |
| `pressedScale` _(Kuito)_      | Escala enquanto premido, p. ex. `0.97`. 1 = nenhuma.              |
| `haptic` _(Kuito)_            | `light`, `medium`, `heavy` ou `selection` ao pousar o dedo.       |

<!-- end of generated props -->

Os eventos transportam `locationX`/`locationY` (na vista) e `pageX`/`pageY`
(no ecrã), em pontos. Um Pressable é um único elemento para o leitor de ecrã,
lido como o texto dos seus filhos a menos que tenha um `label` (ver
[acessibilidade](accessibility.md)).

- **O feedback é nativo.** Opacidade, escala e háptica correm ao pousar o
  dedo, no UIKit ou nas Android Views, sem esperar pelo JavaScript. Compõem-se
  com a `opacity` e as transformações da própria vista, pelo que um cartão
  premido mantém o seu estilo.
- **O Pressable mais interior trata o toque**, como no responder do React
  Native: um toque num Pressable aninhado não prime também o pai.
- Um toque que se desloque 20 pontos para lá da vista (mais `hitArea`)
  cancela-o.
- O Android alarga a área de toque através do `TouchDelegate` do pai, que
  guarda uma única vista: só um Pressable com `hitArea` por pai tem efeito
  aí.

## TextField

Uma entrada de texto: `value` (o seu texto, bidirecional quando recebe um
sinal), `placeholder`, `placeholderColor`, `selectionColor` (cursor e
seleção), `disabled`, e os eventos `onChange` (o texto), `onSubmit`,
`onFocus` e `onBlur`. Os estilos de texto (`color`, `font-size`) aplicam-se
ao texto escrito. Um TextField com fundo desenha apenas esse fundo; sem ele,
mantém o aspeto de campo da plataforma. `enterKeyHint`, `submitBehavior`,
`autoFocus` e `ref.focus()` funcionam como em HTML; `enterKeyHint="next"`
passa nativamente para a entrada seguinte ([teclado](keyboard.md)).

```tsx
<TextField
  class={css.field}
  placeholder="Search"
  placeholderColor="#8a8a96"
  selectionColor="#ff5a5f"
  value={query}
/>
```

## Image

A Image do React Native para URLs (`https`, `file` e `data:`) e para imagens
incluídas na aplicação, com cache e acabamento de carregamento já integrados.

```tsx
<Image
  src={{ uri: 'https://example.com/cover.jpg' }}
  aspectRatio={1.5}
  placeholder="#1e293b"
  fadeDuration={250}
  onLoad={(event) => console.log(event.width, event.height)}
/>
```

Uma imagem importada é incluída em ambas as shells pelo compilador
([assets](assets.md)): PNG e JPEG com as suas variantes `@2x` e `@3x`, e
SVG e PDF desenhados como vetores. O seu tamanho é conhecido quando a
aplicação compila, pelo que não precisa de `width`, `height` nem
`aspectRatio`:

```tsx
import cover from './assets/cover.png';

<Image src={cover} />;
```

<!-- Image props: generated from src/protocol/manifest.ts -->

| Prop                        | Significado                                                                     |
| --------------------------- | ------------------------------------------------------------------------------- |
| `src`                       | Uma string de URL, `{ uri }`, ou uma imagem importada ([assets](assets.md)).    |
| `objectFit`                 | O `object-fit` do CSS: `cover` (predefinição), `contain`, `fill` ou `none`.     |
| `tintColor`                 | Recolore os píxeis opacos, para ícones.                                         |
| `onLoadStart` / `onLoadEnd` | Em torno de cada carregamento, com sucesso ou falha.                            |
| `onLoad`                    | `{ width, height }` da imagem, em píxeis.                                       |
| `onError`                   | `{ error }`, p. ex. `"HTTP 404"`.                                               |
| `aspectRatio` _(Kuito)_     | Largura ÷ altura: dimensiona a vista antes de a imagem chegar.                  |
| `placeholder` _(Kuito)_     | Cor mostrada durante o carregamento.                                            |
| `fadeDuration` _(Kuito)_    | Fundido cruzado, em milissegundos, quando a imagem aparece; 0 por predefinição. |
| `cache` _(Kuito)_           | `memory-disk` (predefinição), `memory`, `disk` ou `none`.                       |

<!-- end of generated props -->

- **Cache.** As imagens descodificadas ficam numa cache em memória (64 MB no
  iOS, um oitavo do heap no Android); os bytes remotos ficam numa cache em
  disco na pasta de caches da aplicação, independentemente dos cabeçalhos de
  cache HTTP.
- **Um pedido por URL.** As vistas que pedem uma imagem já em curso esperam
  por esse pedido em vez de iniciar outro.
- **A descodificação acontece fora da thread principal**, pelo que passar em
  scroll por uma imagem nova não bloqueia um frame.
- Tal como as imagens de rede do React Native, uma Image de um URL não tem
  tamanho intrínseco: dê-lhe `width`/`height`, estique-a numa stack ou defina
  `aspectRatio`. Uma imagem incluída tem o seu próprio tamanho em pontos, a
  menos que uma prop de tamanho ou uma class diga o contrário, e mantém a
  proporção quando só um dos lados é dado.
- Mudar `src` ignora um carregamento anterior mais lento que termine depois.

## Symbol

Os símbolos da própria plataforma, pelo nome: um [SF Symbol](https://developer.apple.com/sf-symbols/)
no iOS e um [Material Symbol](https://fonts.google.com/icons) no Android, tal como
os separadores os mostram ([assets](assets.md#symbols)).

```tsx
<Symbol name="star" size={20} weight="semibold" tintColor="#f5b301" />
<Symbol name={{ ios: 'square.and.arrow.up', android: 'share' }} />
```

<!-- Symbol props: generated from src/protocol/manifest.ts -->

| Prop                  | Significado                                                                 |
| --------------------- | --------------------------------------------------------------------------- |
| `name` _(Kuito)_      | Um SF Symbol no iOS e um Material Symbol no Android, ou `{ ios, android }`. |
| `size` _(Kuito)_      | Em pontos; 24 por predefinição, e o tamanho da vista.                       |
| `weight` _(Kuito)_    | De `ultralight` a `black`; `regular` por predefinição.                      |
| `tintColor` _(Kuito)_ | A cor do símbolo; preto por predefinição.                                   |

<!-- end of generated props -->

Um nome literal que uma plataforma não tenha é um erro de compilação na sua
linha.

## Scroll

Uma vista que faz scroll do seu conteúdo, na vertical ou, com `horizontal`,
na horizontal: uma UIScrollView no iOS. Os seus filhos são dispostos ao longo
do seu eixo; padding e gap aplicam-se ao conteúdo.

<!-- Scroll props: generated from src/protocol/manifest.ts -->

| Prop                              | Significado                                                                                                                                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `horizontal`                      | Scroll lateral. Alterá-la volta a montar a vista.                                                                                                                                                                 |
| `onScroll`, `scrollInterval`      | `{ x, y, contentWidth, contentHeight, layoutWidth, layoutHeight }` em pontos, no máximo uma vez por intervalo de throttle (50 ms por predefinição).                                                               |
| `onReachEnd`, `reachEndThreshold` | Uma vez de cada vez que o fim entra no limiar, em comprimentos visíveis (0.5 por predefinição).                                                                                                                   |
| `onRefresh`, `refreshing`         | Puxar para atualizar (só na vertical, como no React Native).                                                                                                                                                      |
| `scrollbar`                       | Mostra ou esconde a barra de scroll.                                                                                                                                                                              |
| `keyboard`                        | `{ dismiss, persistTaps, inset, avoid }`: quando arrastar fecha o teclado, o que faz um toque fora do campo, se o conteúdo se mantém afastado dele (true por predefinição) ([teclado](keyboard.md#scroll-views)). |

<!-- end of generated props -->

- **O trabalho de scroll é opt-in.** A vista nativa só envia eventos de
  scroll enquanto `onScroll` estiver definido e só instala o puxar para
  atualizar enquanto `onRefresh` estiver, pelo que um Scroll simples nunca
  atravessa para o JavaScript enquanto faz scroll.
- O fim alcançado dispara uma vez por comprimento de conteúdo: quando o
  conteúdo cresce, volta a armar-se. Conteúdo mais curto do que a vista conta
  como ter chegado ao fim, como no React Native.

## List

Uma lista virtualizada pela plataforma: uma UICollectionView ou
RecyclerView é dona do scroll e da reciclagem, e o JavaScript renderiza só as
linhas perto do ecrã ([como funciona](lists.md)).

```tsx
<List
  ref={list}
  data={tracks.value}
  itemKey={(track) => track.id}
  renderItem={({ item, index }) => <TrackRow track={item} position={index + 1} />}
  separator={Divider}
  header={<Header />}
  empty={<Text>No tracks yet</Text>}
  onReachEnd={loadMore}
  refreshing={refreshing.value}
  onRefresh={reload}
/>
```

Suporta `data` (os itens, um sinal deles ou um array de [store](reactivity.md#stores)),
`renderItem` (recebe `item`, `index` e `visible`, um sinal que indica se a
linha está no ecrã), `itemKey` (predefinição: `item.key`, depois
`item.id`, depois a identidade de um item do store, depois o índice; as chaves
têm de ser únicas), `sectionKey`, `renderSection` e `stickySections`
([secções](lists.md#sections-and-sticky-headers)),
`separator`, `header`, `footer`,
`empty` (cada um, um componente ou um elemento), `columns`,
`horizontal`, `inverted`, `initialIndex`, `estimatedItemSize`,
`onViewableChange` com `viewability.itemVisiblePercentThreshold`,
`onReachEnd`/`reachEndThreshold`, puxar para atualizar, e as props de
Scroll. Uma ref (`ref<ListHandle>()`) tem `scrollToIndex`, `scrollToItem`,
`scrollTo` e `scrollToEnd`.

- **As linhas são recicladas nativamente.** Uma célula que saiu do ecrã é
  religada a outra linha: as mesmas vistas nativas, só as props mudam. O
  estado dos componentes de uma linha pertence ao seu item e começa de novo
  quando a célula passa a mostrar outro item.
- **As alterações aos dados animam.** Um novo `data` chega à lista nativa
  como chaves, que ela diferencia em inserções, remoções e movimentos.
- **Só o que mudou é renderizado.** Um novo `data` volta a renderizar as
  linhas ligadas cujo item mudou, e as partes de uma linha que leem `index`
  quando esta se moveu; um sinal lido em `renderItem` volta a renderizar as
  linhas que o leem, pelo que uma linha nunca precisa de uma dependência
  exterior. Sobre um array de store, uma escrita num campo
  (`items[3].liked = true`) é uma única escrita de prop na célula dessa linha.
- **Sem `getItemLayout`.** As linhas medem-se a si próprias; `scrollToIndex`
  aterra na linha à medida que as linhas à sua volta são medidas.
- `columns` dispõe os itens em colunas; `gap` (ou `rowGap` e
  `columnGap`, tal como o `gap` de uma stylesheet compila) espaça linhas e
  colunas. As linhas de header, footer e empty ocupam todas as colunas, e as
  grelhas não têm separadores.

Diferenças deliberadas em relação ao React Native:

- `getItemLayout`, `windowSize`, `initialNumToRender`, `maxToRenderPerBatch`,
  `removeClippedSubviews` e `CellRendererComponent` não existem: a
  plataforma decide o que renderizar.
- Os eventos de uma linha propagam-se através da sua célula até à lista e aos
  seus antecessores, mas uma linha é um módulo separado: volta a
  renderizar-se sozinha, nunca com o ecrã.
- O comprimento min-content de uma lista é zero (o CSS usaria o do seu
  conteúdo), pelo que uma coluna `flex: 1` que contenha uma lista não é
  esticada até ao comprimento de todas as linhas.
- `renderItem` recebe `{ item, index }`; não há um helper `separators`.
- Como no React Native, uma lista vertical dentro de um Scroll vertical
  renderiza todas as linhas: dê às listas o seu próprio scroll.
