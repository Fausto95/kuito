# SystemBars

O chrome do sistema à volta da aplicação, declarado como um componente: a barra de estado, a
cor da vista raiz, a barra de navegação do Android, o modo imersivo e o indicador de início do
iOS. Renderize-o enquanto deve vigorar, ou dê a cada rota o seu.

```tsx
import { Route, Router, SystemBars } from 'kuito';

function Gallery() {
  return (
    <>
      <SystemBars
        statusBar={{ content: 'light' }}
        backgroundColor="#101014"
        navigationBarColor="#4b2a8a"
        navigationBarButtonStyle="light"
      />
      <Photos />
    </>
  );
}

<Router>
  <Route path="/" screen={Home} />
  <Route
    path="/photo/:id"
    screen={Photo}
    systemBars={{ statusBar: { content: 'light', hidden: true } }}
  />
</Router>;
```

| Prop                       | iOS                                                                                                   | Android                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `statusBar`                | a barra de estado, [abaixo](#the-status-bar)                                                          | a barra de estado, [abaixo](#the-status-bar)                          |
| `backgroundColor`          | a vista do view controller raiz                                                                       | a decor view da janela                                                |
| `navigationBarColor`       | sem barra de navegação: sem efeito                                                                    | uma vista atrás da barra de navegação, tão alta quanto o seu inset    |
| `navigationBarButtonStyle` | sem efeito                                                                                            | botões `light` para uma barra escura, `dark` para uma clara           |
| `navigationBarHidden`      | sem efeito                                                                                            | esconde a barra; um deslize a partir da borda mostra-a por um momento |
| `immersive`                | esconde a barra de estado, esconde automaticamente o indicador de início, adia os deslizes das bordas | esconde as barras de estado e de navegação                            |
| `homeIndicatorAutoHidden`  | o indicador de início esbate-se enquanto o ecrã não é tocado                                          | sem indicador de início: sem efeito                                   |

Uma prop que nomeia chrome que uma plataforma não tem não faz nada aí, pelo que o código da
aplicação não precisa de verificações de plataforma. As cores são hexadecimais CSS (`#rgb`,
`#rgba`, `#rrggbb`, `#rrggbbaa`) ou `transparent`; qualquer outra coisa é um `TypeError`
quando o componente renderiza.

## A barra de estado

`statusBar` aceita as props da própria barra de estado:

| Prop              | Valores                                      | Plataformas              |
| ----------------- | -------------------------------------------- | ------------------------ |
| `content`         | `auto`, `light`, `dark`                      | ambas                    |
| `hidden`          | booleano                                     | ambas                    |
| `animated`        | anima `content`, `hidden`, `backgroundColor` | ambas                    |
| `transition`      | `fade` (por omissão), `slide`, `none`        | iOS; o Android tem a sua |
| `backgroundColor` | uma cor hexadecimal, ou `transparent`        | Android; ignorado no iOS |
| `translucent`     | true (por omissão) ou false                  | Android; ignorado no iOS |

`auto` é o estilo com que a aplicação arrancou: `statusBar.style` em kuito.config.ts, `auto`
se não estiver definido, ou seja, texto escuro no modo claro e texto claro no modo escuro, nas
duas plataformas. `SystemBars.statusBarHeight` é a altura da barra de estado em dp no Android,
lida de forma síncrona; null no iOS.

## A pilha

Cada `<SystemBars>` montado é uma entrada numa única pilha. A última entrada que define uma
prop ganha essa prop, cada uma das props de `statusBar` por si, e uma prop omitida ou
`undefined` não define nada. Desmontar uma entrada devolve as suas props às de baixo, com o
`animated` da entrada que as definiu, até às do próprio shell: a sua cor raiz e a barra de
estado do arranque, uma barra de navegação transparente com os botões do tema, nada escondido.
Um `<SystemBars>` cujas props mudam mantém o seu lugar. As mudanças feitas em conjunto, como a
montagem dos SystemBars de um ecrã, atravessam para a plataforma uma vez, e apenas o que
difere do que ela mostra.

`immersive` é o que esconde: a barra de estado, a barra de navegação e o indicador de início,
como se a entrada definisse `statusBar.hidden` (animado), `navigationBarHidden` e
`homeIndicatorAutoHidden`. As props da própria entrada ganham a essas, tal como qualquer
entrada montada depois dela: um `<SystemBars statusBar={{ hidden: false }} />` montado depois
de um imersivo mostra a barra de estado. No iOS também adia os deslizes das bordas, pelo que o
primeiro deslize chega à aplicação. `immersive={false}` não define nada, como uma prop omitida.

Não há setters imperativos: contornariam a pilha, e o âmbito do componente já diz quanto tempo
um estilo dura. A pilha sobrevive a um Live Patch: os SystemBars montados mantêm as suas
entradas quando o bundle da aplicação volta a correr. Um reload devolve todas as barras ao
shell.

## Por ecrã

O `systemBars` de uma `<Route>` aceita as props de um `<SystemBars>` e aplica-as enquanto o
seu ecrã tem o foco: a folha de cima, ou o topo da pilha do separador selecionado
([navegação](navigation.md)). O Router move essa entrada para o topo da pilha antes de o ecrã
com foco renderizar, pelo que ganha aos SystemBars montados antes de o ecrã aparecer, e os
próprios elementos `<SystemBars>` do ecrã continuam a ganhar-lhe. Voltar atrás restaura o ecrã
de baixo.

Um `<SystemBars>` renderizado dentro de um ecrã conta enquanto o ecrã estiver montado: os
ecrãs abaixo numa pilha e os outros separadores continuam montados, e os seus SystemBars
continuam na pilha, por baixo dos mais recentes. Para barras por separador, use a opção
`systemBars` das rotas.

A vista raiz aparece onde as vistas da aplicação não a cobrem: atrás de um ecrã que não
preenche a janela, ou numa transição. Os ecrãs de uma pilha de navegação são opacos.

## Como está ligado

`SystemBars` controla o módulo nativo `SystemUI`. No iOS, o estado vive em `KuitoSystemBars`,
que o view controller raiz do shell lê para `preferredStatusBarStyle`,
`prefersStatusBarHidden`, `preferredStatusBarUpdateAnimation`,
`prefersHomeIndicatorAutoHidden` e `preferredScreenEdgesDeferringSystemGestures` (aparência da
barra de estado baseada no view controller); o shell inicializa-o com o estilo de arranque de
kuito.config.ts. A pilha parte do `hidden` do arranque, lido de forma síncrona, pelo que
devolver `hidden` restaura a barra de estado configurada. Esse estado é do shell
(`KuitoSystemBars`, em `native/ios/App/Shell`), que o view controller raiz lê, pelo que um
shell sem `SystemUI` mantém as barras configuradas.

No Android, `WindowInsetsControllerCompat` define os ícones e a visibilidade, e um deslize a
partir da borda mostra as barras escondidas por um momento. O Android 15 desenha todas as
aplicações de ponta a ponta e ignora `Window.statusBarColor` e `Window.navigationBarColor`,
pelo que a cor de cada barra é uma vista na decor view dimensionada ao inset dessa barra,
igual em todas as versões. `statusBar.translucent: false` desloca antes o conteúdo para baixo
da barra de estado, pelo que uma `SafeArea` aí não recebe inset no topo. Com a navegação de
três botões o sistema desenha um scrim próprio; uma cor de barra de navegação diferente de
transparente desliga-o.

O iOS 13 removeu o indicador de atividade de rede, por isso não há prop para ele.
