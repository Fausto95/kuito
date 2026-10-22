# Primitivas

As primitivas têm o nome do que dispõem ou fazem, e as suas props usam nomes CSS onde o CSS tem o conceito. As props aceitam escalares ou quaisquer dados JSON: objetos, arrays (`edges={['top']}`) e combinações aninhadas atravessam para a vista nativa como JSON; funções e instâncias de classes não podem, a nenhuma profundidade.

## SafeArea e Scroll

`SafeArea` é um VStack com padding na parte dele que o sistema cobre: barra de estado, notch ou Dynamic Island, indicador de início, barra de navegação. A aplicação desenha de margem a margem, pelo que os fundos passam por baixo dessas áreas enquanto a SafeArea mantém o conteúdo desimpedido. Só a sobreposição conta: uma SafeArea a meio do ecrã não recebe inset nenhum. O inset soma-se ao `padding` da própria vista.

`Scroll` faz scroll do seu conteúdo, na vertical ou, com `horizontal`, na horizontal; padding e gap aplicam-se ao conteúdo. O trabalho de scroll é opt-in: a vista nativa só envia eventos de scroll enquanto `onScroll` estiver definido e só instala o puxar para atualizar enquanto `onRefresh` estiver.

```tsx
<Scroll backgroundColor="#0b1020">
  <SafeArea edges={['top']} padding={20}>
    <Text>Header</Text>
  </SafeArea>
</Scroll>
```

## Sheet

Uma bottom sheet nativa: `UISheetPresentationController` no iOS, `BottomSheetDialog` do Material no Android. Os gestos da plataforma, a passagem do scroll para a expansão, a acessibilidade e o fecho por retroceder ou tocar no fundo vêm incluídos. Os seus filhos são vistas Kuito normais, dispostas dentro da sheet. `open` é controlado; `onClose` reporta um fecho, pelo que volte a pôr `open` a false. O conteúdo mantém-se afastado do indicador de início e da barra de navegação, e as props de estilo aplicam-se dentro da sheet.

```tsx
<Sheet
  open={queueOpen.value}
  snapPoints={['content', '90%']}
  onClose={() => (queueOpen.value = false)}
  padding={24}
>
  <Text>Up next</Text>
</Sheet>
```

## Pressable

Um contentor, disposto como um `VStack`, que responde a toques. O feedback é nativo: opacidade, escala e háptica correm ao pousar o dedo, no UIKit ou nas Android Views, sem esperar pelo JavaScript. O Pressable mais interior trata um toque: um toque num Pressable aninhado não pressiona também o seu pai. Um Pressable é um único elemento do leitor de ecrã, lido como o texto dos seus filhos salvo se tiver um `label`.

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

## TextField

Uma entrada de texto: `value` (o seu texto, bidirecional quando recebe um sinal), `placeholder`, `disabled`, e os eventos `onChange`, `onSubmit`, `onFocus` e `onBlur`. Os estilos de texto (`color`, `font-size`) aplicam-se ao texto escrito. `enterKeyHint`, `submitBehavior`, `autoFocus` e `ref.focus()` funcionam como em HTML; `enterKeyHint="next"` passa nativamente para a entrada seguinte.

```tsx
<TextField class={css.field} placeholder="Search" value={query} />
```

## Image e Symbol

`Image` mostra URLs (`https`, `file` e `data:`) e imagens empacotadas com a aplicação, com cache e acabamento de carregamento já integrados. Uma Image de um URL não tem tamanho intrínseco: dê-lhe `width`/`height`, estique-a numa stack, ou defina `aspectRatio`. Uma imagem importada é empacotada em ambas as shells pelo compilador; o seu tamanho é conhecido quando a aplicação compila, pelo que não precisa de tamanho.

```tsx
import cover from './assets/cover.png';

<Image src={cover} />;
<Image src={{ uri: 'https://example.com/cover.jpg' }} aspectRatio={1.5} placeholder="#1e293b" />;
```

`Symbol` desenha os símbolos próprios da plataforma pelo nome: um SF Symbol no iOS e um Material Symbol no Android. Um nome literal que uma plataforma não tem é um erro de compilação na sua linha.

```tsx
<Symbol name="star" size={20} weight="semibold" tintColor="#f5b301" />
<Symbol name={{ ios: 'square.and.arrow.up', android: 'share' }} />
```

## List

Uma lista virtualizada pela plataforma: uma UICollectionView ou RecyclerView é dona do scroll e da reciclagem, e o JavaScript renderiza só as linhas perto do ecrã. As linhas são recicladas nativamente, e o estado dos componentes de uma linha pertence ao seu item. Novos `data` chegam à lista nativa como chaves, que ela diferencia em inserções, remoções e movimentos; só o que mudou é renderizado. Não há `getItemLayout`: as linhas medem-se a si próprias. Dê às listas o seu próprio scroll: uma lista vertical dentro de um Scroll vertical renderiza todas as linhas.

```tsx
<List
  data={tracks.value}
  itemKey={(track) => track.id}
  renderItem={({ item, index }) => <TrackRow track={item} position={index + 1} />}
  separator={Divider}
  empty={<Text>No tracks yet</Text>}
  onReachEnd={loadMore}
/>
```

## Em profundidade

[Primitivas](../../../../docs/primitives.md) cobre as props de cada primitiva, a cache da Image, as secções e colunas da List, e as diferenças deliberadas em relação ao React Native.
