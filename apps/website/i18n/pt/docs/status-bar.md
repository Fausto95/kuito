# StatusBar

O estilo, a visibilidade e, no Android, a cor da barra de estado. Renderize-a
como um componente, durante o tempo em que estiver montada, ou dê a cada rota
a sua própria.

```tsx
import { Route, Router, StatusBar } from 'kuito';

function Player() {
  return (
    <>
      <StatusBar content="light" hidden animated transition="slide" />
      <Video />
    </>
  );
}

<Router>
  <Route path="/" screen={Home} />
  <Route path="/photo/:id" screen={Photo} statusBar={{ content: 'light', hidden: true }} />
</Router>;
```

## Props

| Prop              | Valores                                      | Plataformas                      |
| ----------------- | -------------------------------------------- | -------------------------------- |
| `content`         | `auto`, `light`, `dark`                      | ambas                            |
| `hidden`          | booleano                                     | ambas                            |
| `animated`        | anima `content`, `hidden`, `backgroundColor` | ambas                            |
| `transition`      | `fade` (por omissão), `slide`, `none`        | iOS; o Android tem a sua própria |
| `backgroundColor` | uma cor hexadecimal, ou `transparent`        | Android; ignorada no iOS         |
| `translucent`     | true (por omissão) ou false                  | Android; ignorada no iOS         |

`auto` é o estilo com que a app foi lançada: `statusBar.style` em
kuito.config.ts, `auto` se não for definido, que é texto escuro no modo claro
e texto claro no modo escuro, em ambas as plataformas. As cores são
hexadecimais CSS (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) ou `transparent`;
qualquer outra coisa é um `TypeError` antes de chegar à plataforma.

## A pilha

Cada `<StatusBar>` montada é uma entrada numa única pilha. A última entrada
que define uma prop ganha essa prop, e desmontar uma entrada devolve as suas
props às que estão abaixo, com o `animated` da entrada que as definiu. Uma
`<StatusBar>` cujas props mudam mantém o seu lugar. Mudanças feitas em
conjunto, como a montagem das StatusBars de um ecrã, atravessam para a
plataforma uma só vez, e apenas o que difere do que a plataforma mostra.

Não há setters imperativos: contornariam a pilha, e o âmbito do componente já
diz quanto tempo um estilo dura. `StatusBar.height` é a altura da barra de
estado em dp no Android, lida de forma síncrona; null no iOS.

A pilha sobrevive a um Live Patch: as StatusBars montadas mantêm as suas
entradas quando o bundle da app volta a correr.

## Por ecrã

O `statusBar` de uma `<Route>` aceita as props de uma `<StatusBar>` e aplica-as
enquanto o seu ecrã está focado: o sheet de topo, ou o topo da pilha do
separador selecionado ([navegação](navigation.md)). O Router move essa entrada
para o topo da pilha antes de o ecrã focado renderizar, pelo que ganha às
StatusBars montadas antes de o ecrã aparecer, e os próprios elementos
`<StatusBar>` do ecrã continuam a ganhar-lhe. Voltar atrás restaura o ecrã
abaixo.

Uma `<StatusBar>` renderizada dentro de um ecrã conta enquanto o ecrã estiver
montado, como no React Native: os ecrãs abaixo numa pilha e os outros
separadores continuam montados, e as suas StatusBars continuam na pilha, por
baixo das mais recentes. Para um estilo por separador, use a opção `statusBar`
das rotas.

## Como está ligado

`StatusBar` e [`SystemBars`](system-ui.md) partilham o módulo nativo `SystemUI`.
No iOS, o estado vive em `KuitoSystemBars`, que o root view controller da
shell lê para `preferredStatusBarStyle`, `prefersStatusBarHidden` e
`preferredStatusBarUpdateAnimation` (aparência da barra de estado baseada no
view controller); a shell inicializa-o com o estilo de lançamento do
kuito.config.ts. A pilha parte do `hidden` de lançamento, lido de forma
síncrona, pelo que devolver `hidden` restaura a barra de estado configurada.
`SystemUI` é `always` nas shells porque o root view controller lê o seu
estado. No Android, `WindowInsetsControllerCompat` define os ícones e a
visibilidade. O Android 15 desenha todas as apps de ponta a ponta e ignora
`Window.statusBarColor`, pelo que `backgroundColor` é uma vista na decor view
tão alta quanto o inset da barra de estado, igual em todas as versões;
`translucent: false` afasta, em vez disso, o conteúdo para baixo da barra de
estado, pelo que uma `SafeArea` aí não recebe inset de topo. Um recarregamento
devolve a barra de estado da shell.

O `networkActivityIndicatorVisible` do React Native não existe: o iOS 13
removeu o indicador.
