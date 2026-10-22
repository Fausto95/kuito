# Navegação

As rotas são valores tipados, mostrados em pilhas e barras de separadores nativas: `UINavigationController` e `UITabBarController` no iOS, uma pilha nativa com retrocesso preditivo e a navegação inferior do Material no Android.

## Ficheiros de rota

Uma aplicação é um diretório de ficheiros de rota; o compilador transforma-os em `routes`, uma função tipada por rota. Todos os ficheiros `.tsx` ou `.jsx` nele são uma rota, a não ser que o seu nome ou um diretório acima dele comece por `_` ou `.`.

```text
app/
  _layout.tsx                export const tabs = [{ name: 'shows', title: 'Shows', icon: 'tv' }]
  (shows)/index.tsx          routes.index()            /
  (shows)/show/[id].tsx      routes.show({ id: 42 })   /show/:id
  rate.tsx                   routes.rate({ show })     /rate, a sheet
```

- A exportação por omissão é o ecrã. Recebe os parâmetros da rota como props, e `dismiss`.
- `export const options: RouteOptions<Params>` dá o resto: `title`, `presentation` (`'push'`, por omissão, ou `'sheet'`), `header`, `statusBar`.
- O caminho do ficheiro é o caminho de deep link da rota: `index` nomeia o caminho do seu diretório, `[name]` é um parâmetro `:name` e `[...name]` um catch-all final. Os diretórios `(name)` agrupam ficheiros sem acrescentar um segmento.
- `_layout.tsx` declara a barra de separadores: `export const tabs`, um array de `{ name, title, icon }`. Cada grupo `(name)` de topo é o separador com esse nome; os ficheiros fora dos grupos não ficam em nenhum separador. Sem `tabs`, a aplicação é uma única pilha.

## A tabela de rotas

`routes` tem uma função por rota, nomeada pelos segmentos estáticos da rota em camelCase: `index` para `/`, `showCast` para `show/[id]/cast.tsx`. Chamada com os parâmetros da rota, devolve um `Destination`, o valor que `navigate`, `present` e `<Link to>` recebem. `routes.show({ id: '42' })` é um erro de tipo.

Os parâmetros de uma rota são os do seu caminho, como cadeias, a não ser que o ficheiro declare os seus tipos:

```tsx
export type Params = { id: number; tab?: string };
```

`Params` tem membros `string`, `number` e `boolean`: todos os parâmetros que o caminho nomeia, nenhum opcional; os outros vêm da query string de um deep link. O compilador escreve os tipos da tabela em `routes.generated.d.ts`; faça commit dele com as rotas.

## Mover entre rotas

```tsx
import { Link, navigate, routes } from 'kuito';

navigate(routes.show({ id: 42 }));
<Link to={routes.show({ id: 43 })}>Next show</Link>;
```

- `navigate(to)`: mostra o destino. Uma rota noutro separador seleciona esse separador; qualquer outra rota é empilhada na sua pilha. Uma rota folha abre uma folha.
- `navigate(to, { replace: true })`: substitui o ecrã do topo em vez disso.
- `present(to)`: mostra o destino como um novo ecrã, sempre, e resolve com o seu resultado.
- `goBack()`: fecha a folha do topo, ou desempilha a pilha atual.
- `<Link to replace>`: um pressable que navega.

Um ecrã mantém-se montado, com o seu estado, enquanto há ecrãs empilhados acima dele e enquanto muda de separador; desempilhá-lo desmonta-o.

## Resultados de ecrã

`present` resolve com o resultado que o ecrã apresentado passa à sua prop `dismiss`, que também o fecha, ou `undefined` quando o ecrã sai de qualquer outra forma.

```tsx
// app/rate.tsx
export type Result = number;

export default function Rate({ dismiss }: ScreenProps<{}, Result>) {
  return <Pressable onPress={() => dismiss(5)}>Five stars</Pressable>;
}

// anywhere
const stars = await present(routes.rate()); // number | undefined
```

## Deep links

Uma ligação é o único sítio onde uma rota é uma cadeia. `export const linking = true` em `_layout.tsx` segue as ligações que abrem a aplicação; estão desligadas por omissão. Uma ligação torna-se o destino da primeira rota a cujo caminho corresponde, navegada como `navigate` o faria.

Cada parâmetro de caminho é analisado a partir do seu segmento segundo o seu tipo: `/show/42` é `routes.show({ id: 42 })` quando `id` é um número. Um segmento que não é analisável não corresponde; uma ligação a que nenhuma rota corresponde é um aviso na consola que a indica.

Os esquemas e domínios que abrem a aplicação vêm de `kuito.config.ts`: `urlSchemes` e `linkDomains` ([linking](../../../../docs/linking.md#the-apps-url-scheme)).

## Em profundidade

[Navegação](../../../../docs/navigation.md) cobre os módulos de rota e o arranque a frio, as transições de elementos partilhados, os ícones dos separadores, a árvore `<Router>` em JSX, o que um Live Patch mantém, e o contrato nativo.
