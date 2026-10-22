# Achatamento de vistas

Um contentor que apenas agrupa e posiciona os seus filhos não recebe vista
nativa. Mantém o seu nó na árvore de layout partilhada (`native/shared/layout`),
pelo que continua a dimensionar e a colocar os seus filhos; as vistas destes
juntam-se ao ancestral mais próximo que tem uma vista, deslocadas pela posição
do contentor. O achatamento é automático: não há prop `collapsable`. O Fabric
do React Native faz o mesmo no seu differentiator.

## O que é apenas layout

Um nó é apenas layout quando todas estas condições se verificam:

- O seu tipo é um contentor simples: `VStack`, `HStack`, `Box` ou `Spacer`.
- Todas as props que tem são props de layout em `src/protocol/manifest.ts`
  (preocupação `layout`, gerada em `LAYOUT_PROPS`): padding, margem, tamanho,
  posição e props de flexbox.
- Não tem nenhum handler de evento (`onPress`, `onScroll`, ...) nem `ref`.
- Nenhuma prop é uma animação (`timing(200).to(0)`, `spring().to(12)`) nem é
  conduzida por um valor de movimento na thread de UI (`docs/motion.md`).

Qualquer outra prop mantém a vista: fundo, gradiente, contorno, raio dos
cantos, sombra, opacidade, transformações, `overflow`, `hidden`, `transition`,
`animate`, `enter`/`exit`, props de acessibilidade. A tabela lista o que pode
ser achatado e não o que não pode, pelo que uma prop nova mantém a sua vista a
menos que a sua entrada no manifesto seja uma prop de layout; `hidden` é uma
que ainda assim precisa de uma vista (`needsView`).

A chave decide, não o valor: `backgroundColor={on.value ? 'red' : null}` mantém a sua vista enquanto a cor está desligada, pelo que alterná-la nunca cria
nem destrói vistas.

## Onde acontece

O kernel decide quando faz commit de um plano; os renderizadores executam-no.
O kernel é o único lugar que vê tudo o que precisa de uma vista, já que os
handlers de evento, os refs e as animações nunca chegam ao host como props.
Também aplica a mesma regra em ambas as plataformas e é testado sem um
dispositivo (`test/flattening.test.ts`).

O lote do host transporta-o em dois registos (docs/native-scheduling.md):

- `Create` com a sua flag flattened ativa cria um nó apenas de layout.
- `Flatten` dá a um nó já em commit a sua vista ou retira-lha.

## Promoção e despromoção

Quando um commit acrescenta uma prop que força vista a um nó achatado, o kernel
envia `setFlattened(id, false)` antes da prop. O renderizador cria a vista,
coloca-a onde o nó está na ordem da árvore, e move para dentro dela as vistas
dos filhos do nó. Uma prop definida mais tarde, a partir de um binding ou do
`setProperty` de um element handle, promove o nó da mesma forma.

Quando um commit remove a última prop que força vista, o kernel limpa primeiro
as props na vista e depois envia `setFlattened(id, true)`. O renderizador move
as vistas dos filhos para o ancestral mais próximo com uma vista, pela mesma
ordem, e remove a vista. Um nó só volta a achatar-se num commit, pelo que uma
prop que muda a cada frame nunca faz as vistas oscilar.

Nenhum dos dois volta a montar os filhos: as suas vistas nativas e o seu
estado (o texto de um campo, uma posição de scroll) mantêm-se.

## Nos renderizadores

Ambos os renderizadores mantêm a mesma forma:

- Cada nó tem um nó de layout e um estilo. Um nó achatado não tem vista.
- `place` coloca a vista de um nó no seu host (o ancestral mais próximo com uma
  vista, o conteúdo de um Scroll, ou a raiz) antes da vista seguinte na ordem
  da árvore. Um nó achatado coloca, em vez disso, as vistas dos seus filhos.
- Frames: os filhos de um nó achatado são colocados no seu próprio frame mais
  os frames de todos os ancestrais achatados até ao host
  (`applyFramesToChildren` no iOS, `KuitoFlexLayout.forEachChildView` no
  Android).

## Eventos, hit testing e acessibilidade

Os eventos não mudam. Um toque vai para a vista nativa que foi tocada e
propaga-se através da árvore do kernel, que inclui os nós achatados:
`composedPath()`, `currentTarget` e `parent` são os mesmos que sem
achatamento. Os tipos achatados não emitem eventos nativos próprios.

O hit testing também não muda, com uma exceção, a mesma que no Fabric. O UIKit
e o Android só fazem hit test a um filho dentro dos limites do seu pai. Um
filho que transborda de um contentor achatado pode ser tocado fora da caixa
desse contentor, desde que esteja dentro do ancestral real mais próximo.

Os contentores simples não são elementos de acessibilidade em nenhuma das
plataformas, e as vistas mantêm a sua ordem, pelo que o VoiceOver e o TalkBack
leem os mesmos elementos pela mesma ordem. Um contentor com props de
acessibilidade mantém a sua vista.
