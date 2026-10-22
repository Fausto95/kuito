# Navegação

As rotas são valores tipados, mostrados em pilhas e barras de separadores nativas: o
`UINavigationController` e o `UITabBarController` do UIKit no iOS, uma pilha nativa com
retrocesso preditivo e a navegação inferior do Material no Android. Voltar atrás segue
a plataforma: o deslize a partir da margem no iOS, o gesto e o botão de retroceder no Android.

Uma app é um diretório de ficheiros de rota; o compilador transforma-os na tabela de
rotas e em `routes`, uma função tipada por rota:

```text
app/
  _layout.tsx                export const tabs = [{ name: 'shows', title: 'Shows', icon: 'tv' }, …]
  (shows)/index.tsx          routes.index()            /
  (shows)/show/[id].tsx      routes.show({ id: 42 })   /show/:id
  (library)/library.tsx      routes.library()          /library, the "library" tab
  rate.tsx                   routes.rate({ show })     /rate, a sheet
  routes.generated.d.ts      the types of routes, written by the compiler
```

```tsx
// app/(shows)/show/[id].tsx
import { Link, present, routes, signal, type RouteOptions, type ScreenProps } from 'kuito';

export type Params = { id: number };

export const options: RouteOptions<Params> = { title: ({ id }) => `Show ${id}` };

export default function Show({ id }: ScreenProps<Params>) {
  const stars = signal<number | undefined>(undefined);

  return (
    <>
      <Link to={routes.show({ id: id + 1 })}>Next show</Link>
      <Pressable onPress={async () => (stars.value = await present(routes.rate({ show: id })))}>
        <Text>{stars.value === undefined ? 'Rate it' : `${stars.value} stars`}</Text>
      </Pressable>
    </>
  );
}
```

`routes.show({ id: '42' })` é um erro de tipo, tal como uma rota que não
existe. Só um deep link é um URL: os [deep links](#deep-links) mapeiam um para uma
rota.

## Ficheiros de rota

`kuito dev ios --entry app` executa um diretório de app (uma app `kuito create` é
um). Todos os ficheiros `.tsx` ou `.jsx` nele são uma rota, a não ser que o seu nome ou um
diretório acima dele comece por `_` ou `.` (ponha aí os auxiliares; `.ts`, `.css`
e outros ficheiros também nunca são rotas).

- A exportação por omissão é o ecrã. Recebe os parâmetros da rota como props, e
  `dismiss` ([resultados](#screen-results)).
- `export const options: RouteOptions<Params>` dá o resto: `title` (uma
  cadeia, ou uma função dos parâmetros), `header`, `presentation`
  (`'push'`, por omissão, ou `'sheet'`), `backgroundColor` (a de todo o
  ecrã, também sob as barras: o conteúdo é recuado da área segura, tal como
  o UIKit e o Android o recuam), `snapPoints` (as alturas de uma rota folha,
  tal como [`<Sheet snapPoints>`](primitives.md) as recebe) e
  `systemBars`, as props de um `<SystemBars>`
  aplicadas enquanto o ecrã está focado
  ([SystemBars](system-ui.md#per-screen)).
- O caminho do ficheiro é o caminho de deep link da rota: `index` nomeia o caminho do seu
  diretório, `[name]` é um parâmetro `:name` e `[...name]` um catch-all
  final, correspondido em `name`. Um parêntese reto tem de ser o nome inteiro. Os diretórios `(name)`
  agrupam ficheiros sem acrescentar um segmento.
- `_layout.tsx` declara a barra de separadores: `export const tabs`, um array de
  `{ name, title, icon }`, com `icon` tal como `<Tab>` o recebe (um nome,
  `{ ios, android }` ou `{ uri }`). Cada grupo `(name)` de topo é o separador com
  esse nome, pela ordem do array, e todos os grupos de topo têm de ser um. Os ficheiros
  fora dos grupos não vão em nenhum separador: folhas, ao lado da barra de separadores. Sem `tabs`,
  a app é uma única pilha e os grupos apenas organizam ficheiros. `export const linking = true`
  ativa os [deep links](#deep-links). O compilador lê ambos sem
  executar o ficheiro, pelo que cada um é um literal, e um `_layout.tsx` pode exportar
  apenas um deles.
- As rotas são ordenadas de modo que a primeira correspondência seja a mais específica e a
  rota menos profunda de uma pilha seja o seu primeiro ecrã: catch-alls por último, depois menos segmentos,
  depois segmentos estáticos antes dos parâmetros.

Dois ficheiros com o mesmo caminho ou o mesmo nome, um separador sem rotas, um grupo
sem separador, e um `_layout.tsx` ou uma declaração que o compilador não consegue ler
são erros de compilação que indicam o ficheiro.

## A tabela de rotas

`routes` tem uma função por rota, nomeada pelos segmentos estáticos da rota
em camelCase: `index` para `/`, `show` para `show/[id].tsx`, `showCast` para
`show/[id]/cast.tsx`, `myList` para `my-list.tsx`. Um caminho só de parâmetros é
nomeado por eles (`[...rest].tsx` é `rest`). Chamada com os parâmetros da rota,
devolve um `Destination`, o valor que `navigate`, `present` e `<Link to>`
recebem; uma rota sem parâmetros não recebe nenhum.

```tsx
export const name = 'shows'; // in show.tsx, which show/[id].tsx would also name routes.show
```

Duas rotas que partilhariam um nome são um erro de compilação até que uma declare o
seu próprio com `export const name`, um literal de cadeia que seja um identificador.

Os parâmetros de uma rota são os do seu caminho, como cadeias, a não ser que o ficheiro declare os seus
tipos:

```tsx
export type Params = { id: number; tab?: string };
```

`Params` é um literal de tipo (ou uma interface) de membros `string`, `number` e
`boolean`: um deep link transporta cada um como texto, pelo que cada um tem de ser analisável a partir
dele. Tem todos os parâmetros que o caminho nomeia, nenhum deles opcional; os outros vêm
da query string de um deep link. Um parâmetro não pode chamar-se `dismiss`.

O compilador escreve os tipos da tabela em `routes.generated.d.ts` no diretório da
app de cada vez que compila, e `kuito create` inclui-o, pelo que um editor e o
`tsc` verificam todas as rotas antes de a app correr. Ele aumenta `Routes`, a
interface pela qual `routes` é tipado; faça commit dele com as rotas.

## Módulos de rota

Cada ficheiro de rota compila para um módulo próprio (um chunk, com o que os ficheiros de
rota partilham dividido em chunks ao lado deles), e o módulo de uma rota corre na
primeira vez que a rota é mostrada. Um arranque a frio avalia o kernel, a raiz (a
tabela de rotas) e o módulo do primeiro ecrã, nada mais; um separador monta os seus
ecrãs, e corre os seus módulos, quando é selecionado pela primeira vez.

- O compilador lê a `presentation` de uma rota a partir das suas `options` sem
  correr o módulo, já que decide onde a rota é mostrada antes de o
  módulo carregar: é um literal `'push'` ou `'sheet'`, num literal de objeto
  `options`.
- Uma build de release compila cada chunk para bytecode Hermes por si só, ao lado de
  `app.hbc`: `Modules/` no bundle iOS, `assets/kuito/modules/` no
  APK. O primeiro require de um chunk avalia o seu ficheiro dentro do job que
  o requereu, pelo que navegar continua síncrono, e rastreia-o como
  `Kuito evaluate kuito://modules/<chunk>`.
- Um Live Patch envia todos os chunks da revisão num único script, que os define
  e corre a raiz de novo; o módulo de cada rota corre de novo quando o seu
  ecrã é renderizado de novo, pelo que um ficheiro de rota alterado pelo patch aplica-se no lugar.

## Mover entre rotas

- `navigate(routes.show({ id }))`: mostra o destino. Uma rota noutro
  separador seleciona esse separador; a primeira rota de um separador desempilha esse separador até ela; qualquer outra
  rota é empilhada na sua pilha, a não ser que já esteja no topo com os mesmos
  parâmetros. Uma rota folha abre uma folha.
- `navigate(to, { replace: true })`: substitui o ecrã do topo em vez disso.
- `present(to)`: mostra o destino como um novo ecrã, sempre (empilhado na sua
  pilha, ou como uma folha), e resolve com o seu [resultado](#screen-results).
- `goBack()`: fecha a folha do topo, ou desempilha a pilha atual. No primeiro
  ecrã de uma pilha não faz nada (o retroceder do Android sai então da app).
- `<Link to replace>`: um pressable que navega.

Um ecrã mantém-se montado, com o seu estado, enquanto há ecrãs empilhados acima dele, e
num separador enquanto muda de separador. Desempilhar um ecrã desmonta-o. Um separador monta os seus
ecrãs quando é selecionado pela primeira vez.

Um destino cuja rota falta na tabela, ou cujos parâmetros não lhe correspondem (um
parâmetro de caminho em falta, um valor do tipo errado), é um erro que indica a rota.

## Resultados de ecrã

Um ecrã pode responder ao ecrã que o mostrou. `present` resolve com o
resultado que o ecrã apresentado passa à sua prop `dismiss`, que também o fecha;
resolve `undefined` quando o ecrã sai de qualquer outra forma: o utilizador desliza-o
para fora ou volta atrás, `goBack`, um `navigate` que o substitui ou desempilha, ou um
Live Patch que remove a sua rota.

```tsx
// app/rate.tsx
export type Result = number;

export const options: RouteOptions = { presentation: 'sheet' };

export default function Rate({ dismiss }: ScreenProps<{}, Result>) {
  return <Pressable onPress={() => dismiss(5)}>…</Pressable>;
}

// anywhere
const stars = await present(routes.rate()); // number | undefined
```

O tipo `Result` do ficheiro é o do resultado: `present(routes.rate())` é uma
`Promise<number | undefined>`. O kernel guarda a promise pendente com o
estado de navegação, através do push, do pop e de qualquer Live Patch entre eles.

## Elementos partilhados

Uma vista com um `sharedId` voa até à vista com o mesmo `sharedId` no
ecrã para o qual uma pilha empilha ou desempilha: um cartaz numa lista cresce até à imagem de
cabeçalho do ecrã de detalhes, e encolhe de volta quando se volta atrás.

```tsx
// app/(shows)/index.tsx
<Link to={routes.show({ id: show.id })}>
  <Image sharedId={`poster-${show.id}`} src={show.poster} width={80} height={120} />
</Link>

// app/(shows)/show/[id].tsx
<Image sharedId={`poster-${id}`} src={poster(id)} width="100%" aspectRatio={2 / 3} />
```

- A pilha tira um instantâneo da vista que sai e move o instantâneo do frame dessa vista
  para o da vista que chega, em simultâneo com o push ou pop da própria plataforma, com a
  sua duração e easing; ambas as vistas se escondem enquanto ele voa.
- iOS: todos os pushes e pops animados, incluindo o deslize interativo a partir da margem, que
  conduz o voo com o dedo e o repõe se o deslize for cancelado.
- Android: os pushes e pops que a app ou o botão de retroceder fazem. Um gesto de retrocesso
  preditivo move as páginas com o dedo, e o pop em que termina não tem
  voo.
- Um `sharedId` é único dentro de um ecrã; uma segunda vista com o mesmo nesse
  ecrã não voa. As vistas que estão apenas num dos dois ecrãs não
  voam. As folhas não participam.

## Ícones

O `icon` de um separador é o símbolo da própria plataforma, pelo nome, ou qualquer imagem:

- Uma cadeia: um [SF Symbol](https://developer.apple.com/sf-symbols/) no iOS, um
  [Material Symbol](https://fonts.google.com/icons) no Android, como
  `icon="star"`. Um nome literal que uma plataforma não tem é um erro de compilação na sua
  linha, como para [`<Symbol>`](assets.md#symbols).
- `{ ios, android }`: um nome por plataforma, já que a maioria difere:
  `icon={{ ios: 'house', android: 'home' }}`. Uma plataforma omitida não mostra
  ícone.
- `{ uri }`: qualquer imagem, como `<Image src>` (URI https, file ou data),
  carregada e guardada em cache como uma `Image`. Uma que não consiga carregar é um erro que indica
  o seu separador.

```tsx
<Tab name="top" title="Top rated" icon={{ uri: 'https://example.com/star.png' }}>
```

A barra de separadores ajusta cada ícone ao quadrado de um símbolo (25 pontos no iOS, 24 dp no
Android) e tinge-o a partir do seu alfa: desenhe os ícones de imagem como uma forma sobre
transparência. O Android desenha os Material Symbols a partir da fonte outlined que o Kuito
inclui, com peso regular.

## Rotas em JSX

A tabela do compilador é a mesma árvore `<Router>` que uma app pode escrever à mão,
que então declara ela própria os tipos das suas rotas:

```tsx
import { Link, Route, Router, Tab, Tabs, routes, type RouteTo } from 'kuito';

declare module 'kuito' {
  interface Routes {
    index: RouteTo;
    show: RouteTo<{ id: number }>;
    settings: RouteTo;
  }
}

export default function App() {
  return (
    <Router linking>
      <Tabs>
        <Tab name="discover" title="Discover" icon={{ ios: 'safari', android: 'explore' }}>
          <Route name="index" path="/" screen={Discover} title="Discover" />
          <Route
            name="show"
            path="/show/:id"
            params={{ id: Number }}
            screen={Show}
            title={({ id }) => `Show ${id}`}
          />
        </Tab>
      </Tabs>
      <Route name="settings" path="/settings" screen={Settings} presentation="sheet" />
    </Router>
  );
}
```

- `<Router initial linking>`: a navegação da app. Uma app tem um; um segundo
  é um erro. `initial` é o primeiro destino mostrado (o da primeira rota, por
  omissão); `linking` segue os [deep links](#deep-links).
- `<Route name path params screen title presentation backgroundColor snapPoints header statusBar>`:
  `name` é a sua chave em `routes`; `path` é aquilo a que o caminho de um deep link corresponde
  (segmentos, parâmetros `:name` e um `*name` final); `params` diz como o texto de uma ligação
  é analisado para cada parâmetro, `String` (por omissão), `Number` ou `Boolean`;
  o resto são as [opções](#route-files).
- `<Tabs>` com filhos `<Tab name title icon>`: uma barra de separadores nativa. Cada separador é
  a sua própria pilha das rotas dentro dele, mantida enquanto muda de separador.
- As rotas diretamente em `<Router>` (não as folhas) formam uma única pilha, sem separadores.

## Deep links

Uma ligação é o único sítio onde uma rota é uma cadeia. `<Router linking>`, ou
`export const linking = true` em `_layout.tsx`, segue as ligações que abrem
a app ([linking.md](linking.md)): a ligação com que foi lançada assim que o Router
monta, e cada ligação que chega enquanto corre. Uma ligação torna-se o
destino da primeira rota a cujo caminho corresponde, e é navegada como
`navigate` o faria, pelo que uma rota noutro separador seleciona esse separador e uma rota folha
abre uma folha.

- O caminho segue o esquema: `kuito://show/42` e `kuito:///show/42` são
  `/show/42` (depois de um esquema personalizado, o host é o primeiro segmento), e
  `https://kuito.dev/show/42` é `/show/42` (o host de uma ligação web é o site).
- Cada parâmetro de caminho é analisado a partir do seu segmento segundo o seu tipo: `/show/42` é
  `routes.show({ id: 42 })` quando `id` é um número. Um segmento que não
  é analisável (`/show/forty`) não corresponde.
- Os parâmetros que o caminho não nomeia vêm da query, analisados da mesma forma:
  `/search?q=bear&page=2`. As chaves da query para as quais a rota não tem parâmetro, e o
  fragmento, são ignorados.
- Uma ligação a que nenhuma rota corresponde é um aviso na consola que a indica, e não muda nada.
- Os deep links estão desligados por omissão: uma ligação pode abrir qualquer rota, pelo que uma app
  liga-os quando as suas rotas estão prontas para ser pontos de entrada.

Os esquemas e domínios que abrem a app são os seus próprios, de `kuito.config.ts`:
`urlSchemes` e `linkDomains` ([linking.md](linking.md#the-apps-url-scheme)).

## Live Patch

Um patch que edita ficheiros de rota, ou os separadores e rotas do Router, aplica-os
no lugar: as pilhas, as folhas, o separador selecionado e o estado de todos os ecrãs montados
mantêm-se. Um separador é o mesmo separador pelo `name`, uma rota a mesma rota pelo nome,
`presentation` e separador, pelo que os separadores e as rotas podem ser reordenados, acrescentados, ter
o título mudado ou receber novos caminhos.

- Um ecrã cuja rota o patch removeu (ou moveu para outro separador) fecha-se,
  com os ecrãs acima dele na sua pilha, e um `present` à espera dele
  resolve `undefined`. Uma folha do mesmo modo.
- Um novo separador, ou uma pilha deixada sem ecrã, começa na sua primeira rota.
- O separador selecionado segue o seu `name`; se o patch o removeu, o primeiro separador
  é selecionado.

## Contrato nativo

Ambos os renderizadores implementam quatro tipos, detidos por `properties/KuitoNavigationProperties`
e pelas suas vistas em `views/`:

- `NavigationStack`: uma pilha nativa. Os seus filhos são vistas `NavigationScreen`,
  de baixo para cima. Um filho acrescentado no topo é empilhado, com animação a não ser que seja o
  primeiro; remover o filho do topo desempilha-o, com animação; qualquer outra mudança de ordem
  define a pilha sem animação. A subárvore de cada ecrã é disposta como uma raiz
  própria, no frame que a pilha nativa lhe dá (abaixo do cabeçalho).
- `NavigationScreen`: props `title` (cadeia) e `header` (booleano, true por
  omissão). Emite `dismiss` quando a plataforma o removeu: o deslize a partir da margem ou o
  botão de retroceder do iOS, o gesto de retroceder, o botão de retroceder ou a seta do cabeçalho do Android. Não
  o emite para uma remoção que o kernel pediu. Depois de `dismiss`, o kernel
  remove a vista; o renderizador trata a remoção de um ecrã já desempilhado como
  concluída.
- `NavigationTabs`: uma barra de separadores nativa. Os seus filhos são vistas `NavigationTab`, por
  ordem. Prop `selectedIndex` (número). Emite `select` com `{ index }` quando
  o utilizador escolhe um separador; a seleção muda quando o kernel define
  `selectedIndex`.
- `NavigationTab`: props `title` (cadeia) e `icon`: um nome de símbolo (SF
  Symbol no iOS, Material Symbol no Android), ou em JSON `{ ios, android }`,
  cada renderizador tomando a sua própria chave, ou `{ uri }`, carregado através do
  carregador de imagens da plataforma. Emite `error` com
  `{ error }` quando um ícone de imagem não consegue carregar. O seu único filho é a
  `NavigationStack` do separador.

No Android, a pilha visível mais acima com mais de um ecrã trata o retroceder
(retrocesso preditivo na API 34, seguindo o progresso do gesto); caso contrário, o retroceder
vai para o sistema.

## Créditos

O Android desenha os ícones dos separadores com a fonte outlined dos [Material Symbols](https://github.com/google/material-design-icons),
instanciada com peso regular
(`native/android/app/src/main/res/font/material_symbols.ttf`): Apache License
2.0, Copyright Google LLC (`native/android/app/src/main/LICENSE-material-symbols`).
