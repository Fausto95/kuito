# Estilos nativos

O Kuito compila os estilos em propriedades nativas no momento da compilação. Os módulos
`.css` e `styles({...})` partilham uma única tabela de propriedades (`src/style/properties.ts`):
o CSS usa nomes em kebab-case, `styles()` usa camelCase, e ambos aceitam os mesmos
valores, incluindo cadeias abreviadas. Nada analisa CSS no dispositivo.

```css
.card {
  padding: 20px 24px;
  border: 1px solid #ffffff22;
  border-radius: 20px;
  box-shadow: 0 12px 32px #00000066;
  background: linear-gradient(135deg, #1e3a5f, #0b1220);
  transition:
    transform 400ms spring(14, 180),
    opacity 250ms ease-out;
}
```

```tsx
const sheet = styles({
  card: { padding: '20px 24px', boxShadow: '0 12px 32px #00000066', fontWeight: 600 },
});
```

`styles()` inicializa uma `const` onde quer que uma possa ser declarada: no âmbito do
módulo, no corpo de um componente, num bloco. A build substitui cada chamada pelos seus
nomes de classe e mantém um source map, pelo que os pontos de paragem a seguir a uma folha
de estilos ficam nas suas linhas. Uma chamada a `styles()` em qualquer outro sítio é um
erro nessa chamada.

Um elemento recebe as suas classes através de `class`, o nome do CSS: nomes de uma
importação `.css` ou de `styles()`, como uma cadeia de nomes separados por espaços ou uma
lista cujas entradas falsy são ignoradas. `class` é uma expressão como qualquer prop: quando
um sinal que ela lê muda, o ramo da vista é planeado de novo com as novas
classes, e uma prop que já nenhuma classe define volta ao seu valor por omissão. Uma classe
feita apenas de nomes de uma folha de estilos, cadeias e atributos de dados literais
(`css.card`, `[css.card, 'row']`, `[button.base, { tone: 'warm' }]`) nunca pode
mudar, pelo que a build a passa tal como está e a vista não segue nada
por ela.

```tsx
import css from './card.css';

<VStack class={[css.card, selected.value && css.selected]} />;
```

### Variantes

As variantes de uma classe são regras para os seus atributos de dados, `.card[data-size=large]`
numa folha de estilos e `variants: { <name>: { <value>: { … } } }` numa
entrada de `styles()`. Uma lista de classes escolhe-as com um objeto de atributos
de dados; um valor falsy não escolhe nenhuma:

```css
.card {
  padding: 12px;
}

.card[data-size='large'] {
  padding: 24px;
}

.card[data-tone='muted'] {
  opacity: 0.6;
}
```

```tsx
const button = styles({
  base: {
    padding: '8px 16px',
    borderRadius: 8,
    variants: {
      tone: { primary: { backgroundColor: '#ff5a5f' }, ghost: { borderWidth: 1 } },
    },
  },
});

<VStack class={[css.card, { size: big.value ? 'large' : null }]} />;
<Pressable class={[button.base, { tone: tone.value }]}>...</Pressable>;
```

- Um atributo de dados aplica-se a todas as classes da lista que têm a variante,
  esteja onde estiver na lista; uma variante que nenhuma classe da lista tem, e um
  valor que a sua classe não tem, são erros que indicam o que ela tem.
- Uma variante ganha à sua classe, condições `@media` incluídas, tal como o seletor
  mais específico ganha em CSS. As variantes têm blocos `@media` e `@platform`
  próprios.
- Duas variantes de uma classe podem aplicar-se ao mesmo tempo e nenhuma é mais específica,
  pelo que duas de nomes diferentes que definem a mesma prop são um erro de build que indica
  ambas. Os valores de um mesmo nome nunca se aplicam em conjunto e podem definir as mesmas props.
- Uma regra recebe um atributo de dados com um valor (`.card[data-size=large]`);
  um atributo sem valor, um que não seja `data-`, dois atributos e um
  atributo sem classe são erros.

### A prop `style`

Uma primitiva também recebe os seus próprios estilos, `style={{ … }}`, com as mesmas
propriedades e valores em camelCase de `styles()`. O compilador escreve cada
declaração literal como as props nativas que ela significa, pelo que nada é analisado no
dispositivo. Uma declaração cujo valor muda tem de nomear uma única prop nativa
(`opacity`, `paddingTop`, `backgroundColor`), que então segue os seus
sinais como qualquer prop; uma abreviatura com uma expressão (`border: x.value`) é
um erro de build que indica as props a definir em vez dela.

```tsx
<Box style={{ padding: '4px 8px', borderRadius: 12, opacity: dim.value ? 0.5 : 1 }} />
```

`style` ganha a `class` nas props que ambos definem. Partilhe estilos com `class`;
reserve `style` para o que só uma vista precisa.

Os comprimentos aceitam `px`/`dp` (pontos nativos), `rem` e `em` — ver
[Unidades CSS](css-units.md). Propriedades desconhecidas e valores não suportados fazem falhar a
build com o ficheiro, a linha e o motivo.

## Valores

O compilador lê uma folha de estilos como o CSS o faz: as cadeias e os parênteses contêm
`;`, `{` e `}` como texto (`font-family: "A;B"`, `url(data:…)`), os comentários podem
estar em qualquer sítio, e uma cadeia, um comentário, um bloco ou um parêntese não terminado é um
erro na linha onde abre.

- **O último ganha.** As declarações aplicam-se pela ordem do código, e cada abreviatura
  escreve as suas propriedades individuais: `padding` os quatro lados, `gap` os dois espaçamentos, `border`
  a largura e a cor. Assim, `padding: 4px; padding-top: 8px` mantém os 8px no topo,
  e `padding-top: 8px; padding: 4px` substitui-os, como em CSS. O mesmo vale
  entre classes: a classe mais tardia em `class` ganha.
- **Intervalos.** `opacity` recebe 0–1. O padding, os tamanhos (`width`, `height`, `min-*`,
  `max-*`, `flex-basis`), os espaçamentos, `border-width`, `border-radius`, `font-size`,
  `line-height`, os raios de sombra e o desfoque nunca são negativos; as margens, os insets,
  as translações e `letter-spacing` podem sê-lo.
- **Contornos.** `border` recebe uma largura, o estilo `solid` e uma cor, cada um no
  máximo uma vez e por qualquer ordem (`border: solid red 2px`). Outros estilos são
  erros.

### Cores

Todas as cores compilam para hexadecimal, a única notação que ambos os renderizadores analisam, pelo que o
dispositivo nunca lê sintaxe de cor CSS:

| Escrito                                            | Compilado                       |
| -------------------------------------------------- | ------------------------------- |
| `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`            | tal como escrito, em minúsculas |
| uma cor CSS com nome (`white`, `rebeccapurple`, …) | `#rrggbb`                       |
| `transparent`                                      | `#00000000`                     |
| `rgb(255 0 0 / 50%)`, `rgba(255, 0, 0, 0.5)`       | `#ff000080`                     |
| `hsl(120 100% 50%)`, `hsla(…)`                     | `#00ff00`                       |
| `color(srgb 1 0.5 0 / 0.5)`                        | `#ff800080`                     |

Um nome desconhecido, um hexadecimal malformado, um canal fora do intervalo e um espaço de `color()`
que não seja `srgb` são erros. Os espaços de gama alargada (`display-p3`) precisam de um
renderizador que aceite mais do que hexadecimal, o que nenhum tem ainda.

## Plataformas

Cada plataforma tem o seu próprio bundle. `platform` é `'ios'` ou `'android'`, uma
constante que o compilador fixa por bundle, pelo que um ramo para a outra plataforma
é código morto e sai do bundle:

```tsx
import { platform } from 'kuito';

const back = platform === 'ios' ? 'chevron.left' : 'arrow_back';
```

Os estilos ramificam da mesma forma. Um bloco `@platform` numa folha de estilos contém
regras (classes e tokens `:root`), e um numa entrada de `styles()` contém
declarações; o bundle da outra plataforma nunca os vê. As suas
declarações aplicam-se onde o bloco está, pelo que a mais tardia ganha como de costume:

```css
.card {
  padding: 16px;
}

@platform android {
  .card {
    padding: 12px;
  }
}
```

```tsx
const sheet = styles({
  row: { gap: 8, '@platform ios': { gap: 10 } },
});
```

Um bloco nomeia uma plataforma, `ios` ou `android`; outro nome, um bloco
dentro de outro `@platform`, e uma declaração fora de uma regra são erros.
Não há `Platform.select` em tempo de execução.

## Tokens

As propriedades personalizadas declaradas em `:root` (ou `@tokens`) são tokens: `var(--name)`
é substituído pelo seu valor no momento da compilação, também dentro das abreviaturas. Uma folha de estilos
vê os seus próprios tokens e os das folhas de estilos que importa com `@import`:

```css
/* tokens.css */
:root {
  font-size: 16px;
  --accent: #ff5a5f;
  --space: 12px;
}
```

```css
/* card.css */
@import './tokens.css';

.card {
  padding: var(--space);
  border: 1px solid var(--accent);
}
```

- `@import "<path>";` ou `@import url(<path>);`, com um caminho relativo ao
  ficheiro que importa, antes de qualquer regra. As importações são transitivas, e um ficheiro
  alcançado por duas importações é lido uma vez.
- Uma importação partilha tokens e o font-size de `:root`, não classes: um componente
  que usa classes de `tokens.css` importa ele próprio esse módulo.
- Um token resolve-se no ficheiro que o declara: um token em `tokens.css` pode
  usar os tokens que `tokens.css` importa, nunca os de um ficheiro que o importa. Assim,
  um token significa o mesmo em todo o lado onde é usado.
- Declarar um token duas vezes no mesmo âmbito é um erro, seja num ficheiro ou em
  dois importados; o mesmo vale para uma importação circular, um ficheiro em falta e um URL ou
  caminho absoluto. Cada erro indica o ficheiro e a linha.
- O Live Patch vigia todos os ficheiros importados: editar `tokens.css` recompila
  todas as folhas de estilos que o usam.
- Uma app tem um único font-size de `:root`. Declare-o numa folha de estilos e
  importe essa com `@import`; uma segunda folha de estilos no bundle que declare o seu próprio
  é um erro que indica ambas as linhas.

Um bloco `:root` dentro de `@media (prefers-color-scheme: dark)` (ou `light`)
redefine os tokens para esse esquema, no ficheiro que os declara:

```css
:root {
  --surface: #ffffff;
  --ink: #111114;
}

@media (prefers-color-scheme: dark) {
  :root {
    --surface: #121218;
  }
}
```

Uma prop cujo valor difere entre os esquemas, através de um token ou de um token
construído a partir de um, compila para um marcador, e a folha de estilos instala dois manifestos
estáticos dos valores que ele representa. O kernel resolve um marcador através do
esquema de cores (`appearance.colorScheme`; sem preferência lê-se como claro),
pelo que uma mudança de tema reenvia apenas as props que o seguem, num único commit,
sem planear nada de novo. Um token que os esquemas partilham mantém-se uma constante. Só
o esquema de cores redefine tokens: um bloco `:root` sob qualquer outra consulta é
um erro, tal como o token de um esquema sem valor fora de `@media`.

## Condições

Os blocos `@media` contêm regras cujas declarações se aplicam enquanto a sua consulta
se verifica. Não há cascata em tempo de execução: cada bloco compila para um conjunto de props
alternativo das suas classes, e o kernel escolhe pelo estado do sistema, enviando apenas as
props que diferem quando ele muda.

```css
.grid {
  padding: 12px;
  flex-direction: column;
}

@media (width-class: expanded) {
  .grid {
    flex-direction: row;
  }
}

@media (min-width: 600px) and (prefers-reduced-motion: no-preference) {
  .grid {
    padding: 24px;
  }
}
```

```tsx
const sheet = styles({
  row: { gap: 8, '@media (min-width: 600px)': { gap: 16 } },
});
```

| Funcionalidade           | Valores                         | Segue                                                               |
| ------------------------ | ------------------------------- | ------------------------------------------------------------------- |
| `min-width`, `max-width` | um comprimento em `px`          | a largura da janela, em pontos (iOS) ou dp (Android)                |
| `width-class`            | `compact`, `medium`, `expanded` | `window.widthClass`: abaixo de 600, abaixo de 840, e mais largo     |
| `prefers-color-scheme`   | `light`, `dark`                 | `appearance.colorScheme`; sem preferência lê-se como claro          |
| `prefers-reduced-motion` | `reduce`, `no-preference`       | `accessibility.reduceMotion`; desconhecido lê-se como no-preference |

- Uma consulta é um conjunto de funcionalidades entre parênteses unidas por `and`. Os tipos de media (`screen`),
  `not`, `or`, as listas e os blocos `@media` aninhados são erros; o mesmo vale para uma funcionalidade
  nomeada duas vezes e uma funcionalidade ou um valor desconhecido.
- As declarações de uma condição ganham às da própria classe enquanto ela se verifica,
  qualquer que seja a sua ordem; uma classe mais tardia em `class` ganha a ambas. As próprias props
  de uma vista e `style` ganham a todas as classes.
- Uma prop que só uma condição define volta ao seu valor por omissão quando a condição
  deixa de se verificar.
- `font-size` não pode mudar com uma condição ou um tema: os filhos herdam
  o tamanho com que o seu pai foi planeado. Dê a cada caso uma classe própria.
- Uma vista segue apenas o estado do sistema que as props das suas classes leem: uma classe
  sem token nem condição faz com que não siga nada.
- Os blocos `@platform` são decididos por bundle ([plataformas](#platforms)) e
  podem conter blocos `@media`, e vice-versa.

## Propriedades

<!-- style properties: generated from src/style/properties.ts -->

| CSS                                                                                                                                                         | Props nativas                                                                                                                                                  | Valores                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `background`                                                                                                                                                | `backgroundColor`, `backgroundGradient`                                                                                                                        | cor, ou `linear-gradient(<angle> \| to <side>, color, color, …)`                                 |
| `background-color`, `color`                                                                                                                                 | o mesmo, em camelCase                                                                                                                                          | cor ([cores](#colors))                                                                           |
| `opacity`                                                                                                                                                   | o mesmo                                                                                                                                                        | 0–1                                                                                              |
| `padding`                                                                                                                                                   | `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`                                                                                                   | 1–4 comprimentos não negativos, como em CSS                                                      |
| `padding-top`, `padding-right`, `padding-bottom`, `padding-left`, `padding-horizontal`, `padding-vertical`                                                  | `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`                                                                                                   | comprimento não negativo                                                                         |
| `gap`, `row-gap`, `column-gap`, `width`, `height`, `min-width`, `max-width`, `min-height`, `max-height`, `aspect-ratio`                                     | `rowGap`, `columnGap`, `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight`, `aspectRatio`                                                      | ver [Layout](#layout)                                                                            |
| `overflow`, `direction`, `box-sizing`, `position`, `top`, `right`, `bottom`, `left`, `margin-top`, `margin-right`, `margin-bottom`, `margin-left`           | o mesmo, em camelCase                                                                                                                                          | ver [Layout](#layout)                                                                            |
| `flex-direction`, `flex-wrap`, `flex-grow`, `flex-shrink`, `flex-basis`, `flex-line-count`, `align-items`, `align-self`, `align-content`, `justify-content` | o mesmo, em camelCase                                                                                                                                          | ver [Layout](#layout)                                                                            |
| `inset`, `margin`, `margin-horizontal`, `margin-vertical`, `flex`, `flex-flow`                                                                              | `top`, `right`, `bottom`, `left`, `marginTop`, `marginRight`, `marginBottom`, `marginLeft`, `flexGrow`, `flexShrink`, `flexBasis`, `flexDirection`, `flexWrap` | ver [Layout](#layout)                                                                            |
| `display`, `hidden`                                                                                                                                         | `hidden`                                                                                                                                                       | `none`, `flex`; `hidden` recebe `true` ou `false`                                                |
| `border`                                                                                                                                                    | `borderWidth`, `borderColor`                                                                                                                                   | `<width> solid <color>`, por qualquer ordem, cada um no máximo uma vez; ou `none`                |
| `border-radius`, `corner-radius`, `border-width`, `border-color`                                                                                            | `borderRadius`, `borderWidth`, `borderColor`                                                                                                                   | comprimento não negativo / cor                                                                   |
| `box-shadow`                                                                                                                                                | `shadowOffsetX`, `shadowOffsetY`, `shadowRadius`, `shadowColor`                                                                                                | `<x> <y> [blur] <color>`; o desfoque é dividido ao meio para o raio nativo                       |
| `shadow-color`, `shadow-radius`, `shadow-offset-x`, `shadow-offset-y`                                                                                       | o mesmo, em camelCase                                                                                                                                          | cor / comprimento                                                                                |
| `font-size`, `letter-spacing`                                                                                                                               | o mesmo, em camelCase                                                                                                                                          | comprimento                                                                                      |
| `line-height`                                                                                                                                               | o mesmo, em camelCase                                                                                                                                          | comprimento, ou um múltiplo sem unidade do tamanho da fonte                                      |
| `font-weight`                                                                                                                                               | o mesmo, em camelCase                                                                                                                                          | `normal`, `bold`, `100`–`900`                                                                    |
| `font-family`, `font-style`                                                                                                                                 | o mesmo, em camelCase                                                                                                                                          | uma família do sistema, incluída no pacote ou carregada ([fontes](fonts.md)); `normal`, `italic` |
| `text-align`, `text-transform`                                                                                                                              | o mesmo, em camelCase                                                                                                                                          | `left`/`center`/`right`; `none`/`uppercase`/`lowercase`/`capitalize`                             |
| `-webkit-line-clamp`, `number-of-lines`                                                                                                                     | `lineClamp`                                                                                                                                                    | número inteiro (`0` = sem limite)                                                                |
| `transform`                                                                                                                                                 | `translateX`, `translateY`, `scale`, `scaleX`, `scaleY`, `rotate`                                                                                              | `translate()`, `translateX/Y()`, `scale()`, `scaleX/Y()`, `rotate(deg\|rad\|turn)`, `none`       |
| `translate-x`, `translate-y`, `scale`, `scale-x`, `scale-y`, `rotate`                                                                                       | o mesmo, em camelCase                                                                                                                                          | comprimento; um número; um ângulo (`deg`, `rad`, `turn`)                                         |
| `transition`                                                                                                                                                | o mesmo                                                                                                                                                        | ver [Transições](#transitions)                                                                   |

<!-- end of generated style properties -->

## Layout

O Kuito dispõe os elementos com flexbox CSS e posicionamento absoluto. O motor
(`native/shared/layout`) é um port em C++ do algoritmo de flexbox do [Taffy](https://github.com/DioxusLabs/taffy),
sob licença MIT e creditado em `native/shared/layout/LICENSE-taffy`.
Corre a própria suite de conformidade do Taffy: 2.656 fixtures cujos layouts esperados vêm
do Chrome (`test/flex-conformance.test.ts`). O UIKit e as Android Views apenas recebem
os frames que ele calcula, pelo que uma árvore é disposta de forma idêntica em iOS e Android.

O layout é incremental, como no Taffy: os resultados persistem entre passagens, e uma alteração
só dispõe de novo o nó que toca e os antepassados desse nó. As props de layout, os insets e as edições
da árvore marcam o seu nó; o mesmo fazem as props que podem alterar o tamanho do conteúdo de um texto, de um controlo
ou de uma lista (texto, fonte, placeholder, linhas), declaradas nas suas tabelas de props. Uma prop de pintura
(cor, opacidade, alinhamento) deixa o layout como está, e o texto de um irmão nunca é
medido de novo porque uma imagem chegou noutro sítio. Uma subárvore oculta é disposta como zeros, como no Taffy, mas os seus textos mantêm as
medições, pelo que mostrar um ecrã de novo não pede à plataforma que meça nada.

Cada nó mantém um conjunto fixo de resultados em cache, os slots do Taffy, pelo que um viewport que muda em
cada passagem (um redimensionamento, o teclado) substitui entradas em vez de as acrescentar.

Todos os contentores são contentores flex, e o dimensionamento segue o CSS exatamente:

| Propriedade                                                      | Valores                                                                                                                             |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `flex-direction`, `flex-wrap`, `flex-flow`                       | `row`, `column`, `row-reverse`, `column-reverse`; `nowrap`, `wrap`, `wrap-reverse`, `balance`                                       |
| `flex`, `flex-grow`, `flex-shrink`, `flex-basis`                 | como em CSS (`flex: 1` é `1 1 0%`, `flex: none`, `flex: 2 0 120px`); `flex={n}` em JSX é o do React Native                          |
| `justify-content`, `align-content`                               | `flex-start`, `flex-end`, `start`, `end`, `center`, `stretch`, `space-between`, `space-around`, `space-evenly`, com `safe`/`unsafe` |
| `align-items`, `align-self`                                      | `flex-start`, `flex-end`, `start`, `end`, `self-start`, `self-end`, `center`, `baseline`, `stretch`, com `safe`/`unsafe`            |
| `gap`, `row-gap`, `column-gap`                                   | comprimento ou percentagem; `gap: <row> <column>`                                                                                   |
| `width`, `height`, `min-*`, `max-*`                              | comprimento, percentagem, `auto`, `min-content`, `max-content`, `fit-content`, `fit-content(<length>)`, `stretch`                   |
| `aspect-ratio`                                                   | `16 / 9` ou um número                                                                                                               |
| `margin` (1–4 valores), `margin-*`, `margin-horizontal/vertical` | comprimento, percentagem ou `auto` (as margens auto absorvem o espaço livre, como em CSS)                                           |
| `position`, `top`, `right`, `bottom`, `left`, `inset`            | `relative` (os insets deslocam a caixa) ou `absolute`; comprimento, percentagem ou `auto`                                           |
| `padding`, `border-width`                                        | recuam a caixa de conteúdo; as percentagens resolvem-se em relação à largura do bloco contentor                                     |
| `box-sizing`                                                     | `border-box` (por omissão) ou `content-box`                                                                                         |
| `overflow`                                                       | `visible`, `hidden`, `clip`, `scroll`; hidden e scroll também recortam                                                              |
| `direction`                                                      | `ltr` ou `rtl`: as linhas correm da direita para a esquerda, e start/end invertem-se                                                |
| `flex-line-count`                                                | o número mínimo de linhas que um contentor com quebra usa (CSS Flexbox 2)                                                           |

Coisas que decorrem do CSS e surpreendem quem vem do React Native:

- `flex-shrink` tem 1 por omissão, pelo que um item com um tamanho explícito ainda encolhe
  quando a sua linha transborda. Dê-lhe `flex-shrink: 0` para o manter.
- O tamanho mínimo automático de um item flex é o seu conteúdo: o texto não encolhe
  abaixo da sua palavra mais longa, um contentor não encolhe abaixo dos seus filhos. `overflow:
  hidden` (ou `min-width: 0`) deixa-o encolher mais.
- `align-items: stretch` só estica os filhos sem tamanho transversal explícito.
- As percentagens resolvem-se em relação ao bloco contentor; o padding e as margens
  em relação à sua largura, em todos os lados.

O Kuito difere da web num ponto: como o React Native, cada vista é o
bloco contentor dos seus filhos `position: absolute`, pelo que os insets são relativos
à caixa de padding do pai, qualquer que seja o `position` do próprio pai.

Cada tipo de vista parte de valores por omissão:

| Vista                         | Direção | Valores por omissão                                                             |
| ----------------------------- | ------- | ------------------------------------------------------------------------------- |
| `VStack`, `Box`, `Pressable`  | coluna  |                                                                                 |
| `HStack`                      | linha   | `align-items: center`                                                           |
| `Scroll`                      | coluna  | `flex-grow: 1` e um contentor de scroll: preenche o espaço que o seu pai deixou |
| `Scroll horizontal`           | linha   | o mesmo, com scroll lateral                                                     |
| `Spacer`                      | —       | `flex-grow: 1`: ocupa o espaço livre ao longo do seu pai                        |
| `Divider`                     | —       | pelo menos 1pt de altura                                                        |
| `Button`, `Toggle`, `Spinner` | —       | `flex-shrink: 0`: os controlos transbordam em vez de se esmagarem               |

Uma vista de scroll dispõe os seus filhos sem limite ao longo do seu eixo e faz scroll
do excedente. `display: none` (`hidden`) remove uma vista do layout.
Os frames são arredondados a píxeis do dispositivo, pelo que os vizinhos nunca deixam folgas nem se sobrepõem.

As vistas raiz empilham-se numa coluna que preenche todo o ecrã, de ponta a ponta
em ambas as plataformas, como no React Native: o conteúdo pode desenhar-se sob a barra de estado,
o notch e o indicador de início. Envolva o conteúdo num `SafeArea` para o manter afastado
deles. Um Scroll raiz ocupa toda a altura.

Não suportado: layout em bloco e em grelha, floats, modos de escrita verticais e
o posicionamento estático do CSS (uma caixa absoluta pertence sempre ao seu pai).

## Transições

`transition` enumera propriedades com uma duração, uma função de temporização e um atraso,
como em CSS:

```css
transition:
  transform 400ms spring(14, 180),
  opacity 250ms ease-out 50ms;
```

- Propriedades animáveis: `opacity`, `background-color`, `transform` (todas as
  props de transformação) e `all`.
- Funções de temporização: `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`,
  `cubic-bezier(x1, y1, x2, y2)` e `spring(damping, stiffness[, mass])`
  (uma mola ignora a duração; o seu segundo tempo é o atraso).
- As animações correm na thread de UI, no executor de valores de movimento
  ([Movimento](motion.md#animated-props-animate-and-transition)); o JavaScript apenas envia os valores de destino.

## Notas de plataforma

Ambos os renderizadores aplicam todas as propriedades acima; onde uma plataforma não consegue igualar
o CSS exatamente, degrada-se da seguinte forma.

- **Recorte.** Como em CSS, os filhos desenham-se fora do seu pai a menos que haja
  `overflow: hidden` (o recorte por omissão do Android é desligado). No iOS, uma
  vista arredondada recorta o seu conteúdo a menos que tenha uma sombra; `overflow: hidden`
  recorta sempre, o que também esconde a sombra.
- **Raios.** `border-radius` é limitado a metade do tamanho da vista, pelo que `999px`
  faz uma pílula em ambas as plataformas.
- **Sombras.** O iOS usa o deslocamento, o desfoque e a cor na íntegra. O Android desenha
  sombras de elevação: o desfoque mapeia para a elevação, a cor aplica-se no
  Android 9+, e o deslocamento é ignorado (a fonte de luz é fixa).
- **Gradientes.** O iOS usa qualquer ângulo; o Android ajusta ao múltiplo de 45° mais próximo.
- **Layout.** Idêntico em ambas as plataformas (um único motor). Os controlos nativos
  mantêm o tamanho da sua plataforma: os botões Material do Android são mais largos do que
  os do UIKit e podem transbordar uma linha que cabe no iOS. A largura min-content do texto
  é a sua palavra mais larga, medida com a fonte da plataforma.
- **Tipografia.** Os pesos de fonte numéricos e `line-height` precisam do Android 9+;
  as versões anteriores recorrem a regular/bold e à altura de linha por omissão.
  As famílias incluídas no pacote e carregadas escolhem os seus ficheiros pelo peso em todas as versões
  ([fontes](fonts.md#how-fontfamily-resolves)); um `font-family` desconhecido é um
  erro que o indica.
