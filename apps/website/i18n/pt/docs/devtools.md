# Devtools

As compilações de desenvolvimento das shells do Kuito incluem devtools. Elas não se
metem no caminho da sua aplicação: não há nenhum botão flutuante.

## Abri-las

| Onde                  | Como                                            |
| --------------------- | ----------------------------------------------- |
| Simulador iOS         | ⌘D                                              |
| Emulador Android      | ⌘M / Ctrl+M, ou a tecla de menu                 |
| Um dispositivo físico | Abane-o                                         |
| A CLI `kuito dev`     | Prima `m` (funciona para todos os dispositivos) |

Abrem como uma folha nativa com:

- **Ligação.** Se a aplicação está ligada ao servidor de desenvolvimento, e a
  razão e a contagem decrescente enquanto se volta a ligar.
- **Recarregar / Religar.** Recarregar reinicia a sua aplicação num runtime Hermes novo
  com o código-fonte mais recente; Religar reabre a ligação de desenvolvimento.
- **Live Patch.** As últimas atualizações e quanto tempo cada uma demorou a aplicar.
- **Último erro.** Erros de patch, de renderização e de evento, até serem limpos. O
  [LogBox](logbox.md) mostra cada um por completo, com a sua origem.
- **Monitores** (lembrados entre arranques):
  - **Monitor de desempenho**: FPS da thread de UI, o tempo da última frame, frames
    perdidas, e uma linha de FPS ao longo dos últimos 15 segundos contra o alvo do
    ecrã. A sua última linha são os commits do Kuito: análises de props por commit e a
    última latência de toque-a-aplicado com o seu p95 ([desempenho](performance.md#native-counters)).
    Arraste-o para onde quiser; ele assenta no canto mais próximo.
  - **Realçar atualizações**: como o react-scan, cada vista que o renderizador atualiza
    pisca — verde, depois âmbar, depois vermelho à medida que a mesma vista continua a atualizar-se
    dentro de um segundo, com uma contagem ×N. Vermelho constante significa que algo renderiza
    de novo mais do que devia. Por baixo de cada piscar, a escrita de sinal que o causou
    (`visits = 2`): a escrita cujo binding definiu a prop, ou cujo ramo
    foi replaneado. Uma atualização que nenhuma escrita causou (um Live Patch, um evento nativo que a
    vista reportou) não tem etiqueta.

  Ambos os monitores redesenham a janela por si próprios, pelo que custam algum tempo de frame
  seu; [desempenho](performance.md) mede com eles desligados.

- **Servidor de desenvolvimento.** O URL do WebSocket, editável.

## Enquanto a sua aplicação carrega

Um ecrã de arranque diz pelo que a shell está à espera — Hermes, o servidor de desenvolvimento,
a primeira frame da sua aplicação — e desvanece-se na primeira frame. Depois disso, uma pílula
sob a barra de estado reporta o Live Patch (`Updated in 18 ms`), falhas (toque para
abrir as devtools) e um servidor de desenvolvimento perdido até ele voltar (`Reconnected`).
Os avisos e erros que a sua aplicação regista ou lança acumulam-se no
[LogBox](logbox.md).

## A ligação de desenvolvimento

A shell volta a ligar-se por si própria: faz ping ao servidor de desenvolvimento para notar uma ligação morta
e tenta de novo com backoff (0,5 s até 5 s) até o servidor estar de volta, pelo que um
`kuito dev` reiniciado não exige nenhuma ação no dispositivo. Um patch que o dispositivo já
aplicou não é aplicado de novo quando o servidor o reenvia.

A ligação transporta mensagens JSON identificadas por `type`, declaradas uma vez em
`src/protocol/dev-link.ts`; `npm run generate` escreve-as em
`KuitoDevLink.generated` em Swift e Kotlin, e o `handle()` de cada shell
faz switch sobre o enum gerado, pelo que uma mensagem nova falha a compilar até ambas
a tratarem. O servidor envia `patch` (o código-fonte de uma revisão), `command` e
`symbolicated`; uma shell envia `hello` (o seu id, nome e plataforma), `log`,
`open`, e um ack por cada patch que recebe: `applied` (a revisão e
quanto tempo demorou a avaliá-la) ou `rejected` (a revisão, um código como
`EVALUATION`, e a mensagem). O servidor valida cada mensagem contra a
mesma tabela e reporta uma malformada com a sua razão.

## Depurar com o Chrome DevTools

As compilações de desenvolvimento tornam ambos os runtimes Hermes da aplicação depuráveis através do
Chrome DevTools Protocol, da forma como o React Native DevTools depura o Hermes:

| Alvo         | O que corre lá                                                             |
| ------------ | -------------------------------------------------------------------------- |
| Thread de JS | A sua aplicação e o kernel do Kuito (`src/runtime`)                        |
| Thread de UI | Valores de movimento, gestos e callbacks da thread de UI (`src/ui-thread`) |

Prima `j` no `kuito dev` para abrir o DevTools na thread de JS do dispositivo que
se ligou por último, ou `u` para a sua thread de UI (`k` abre o
[painel Components](#components)). Obtém o frontend do próprio Chrome:

- **Sources**: o seu TypeScript, através dos source maps do compilador.
  Breakpoints, execução passo a passo, âmbitos, expressões de watch e instruções `debugger;`
  funcionam todos. O Live Patch continua a funcionar enquanto o DevTools está ligado;
  cada patch aparece como um script novo.
- **Console**: a saída de `console.*` com os próprios objetos registados, ligados
  à linha que os registou, e avaliação na frame em pausa ou no
  âmbito global. As entradas registadas antes de o DevTools abrir são mantidas (as últimas
  1000).
- **Performance**: grave um perfil de CPU.
- **Memory**: tire um snapshot do heap.

O DevTools abre num browser próprio: o primeiro browser baseado em Chromium
instalado (Chrome, Chrome Canary, Chromium, Edge, Brave), iniciado com um
perfil dedicado em `.kuito/devtools-browser` e uma porta de depuração em
loopback. Defina `KUITO_DEVTOOLS_BROWSER` para um executável Chromium para escolher
outro. O Chromium recusa abrir URLs `devtools://` a partir do exterior, por isso o
Kuito abre o mesmo frontend incluído tal como esse browser o serve na sua
porta de depuração: nada é descarregado, e o frontend corresponde sempre ao
browser.

Qualquer outro cliente CDP também funciona. O `kuito dev` lista os alvos em
`http://127.0.0.1:8765/json/list`, como o Chrome faz, pelo que o `chrome://inspect`
os encontra assim que `127.0.0.1:8765` for adicionado em _Discover network targets_,
e os editores que depuram Node ligam-se ao seu `webSocketDebuggerUrl`.

### Components

Prima `k` no `kuito dev` para o painel Components. Ele mostra o modelo próprio do Kuito
da aplicação, **sinal → binding → vista**, para o dispositivo que se ligou
por último, no mesmo browser que o DevTools.

- **Árvore.** Cada instância de componente montada, com o nome que lhe deu, com
  a sua `key` de lista. Segue a aplicação à medida que os componentes são montados e desmontados.
  Passar o rato por cima de um componente contorna as vistas que ele renderizou no dispositivo.
- **Componente.** As suas props tal como ele as lê, os seus hooks por nome, os
  componentes que o renderizam (owners), e as vistas nativas que ele renderizou.
  O compilador passa a cada `signal()` a variável como a qual é declarado, pelo que
  `const visits = signal(1)` aparece como `visits`; um hook que ele não viu mostra
  o seu ordinal (`state 1`). `task()` e `resource()` mostram se estão
  a correr, os seus dados e o seu erro; os valores `motion()` mostram o seu último
  valor; as refs mostram o que contêm.
- **Vista.** Selecionar uma vista, a partir de um componente ou com **Select on device**
  (depois toque na vista), mostra cada uma das suas props com o binding por trás dela:
  os sinais que a sua última execução leu, cada um com o seu valor e o componente
  que o detém. Uma prop sem binding é uma constante. Uma prop atualizada
  enquanto o painel estava aberto mostra a escrita de sinal que a causou.
- **Sinal.** Selecionar um sinal mostra o que ele comanda: cada prop cujo
  binding o lê, e cada ramo que ele decide (um `Show`, um `Switch` de fluxo,
  uma expressão filha reativa, ou a estrutura de um módulo inteiro). Os sinais criados
  fora de um componente, e os computeds, aparecem por tipo e número.
- **Edição.** Os valores são JSON; Enter define um. Um valor de estado ou sinal
  recebe a edição como se o seu código tivesse escrito `.value`, pelo que os bindings e a
  estrutura seguem. Um valor `motion()` move-se para a edição. Uma prop de vista
  recebe a edição na vista nativa até o seu binding a escrever de novo.
  Os computeds são só de leitura.

- **Histórico.** O Histórico do painel lista as últimas 500 escritas dos
  sinais que os componentes detêm (`signal()` num componente), as mais recentes primeiro, com o componente que detém
  cada uma. **Step back here** reinicia a aplicação num runtime novo e repete
  as escritas até essa, por ordem: cada uma assenta assim que o seu componente tiver
  sido montado e os replaneamentos da escrita anterior tiverem corrido, pelo que a aplicação
  chega a esse ponto da mesma forma que chegou da primeira vez. As escritas mais antigas do que as
  últimas 500 deixam de ser mantidas, e um passo atrás começa então depois delas.
  Só os valores JSON são repetidos; uma escrita de uma função ou instância de classe é listada
  como não repetível. O que a aplicação faz por si própria no runtime novo continua a
  acontecer (um `resource()` volta a fazer fetch, os timers correm), e o estado nativo como
  um deslocamento de scroll recomeça. As escritas das tarefas, dos valores de movimento e das refs não são
  listadas: vêm daquilo que esses hooks executam.

O grafo é lido da store do kernel quando o painel o pede (a
seleção é atualizada a cada segundo enquanto o painel está aberto), pelo que não custa nada à
aplicação enquanto ninguém olha. O painel fala com um pequeno backend no
kernel (`src/runtime/devtools.ts`, o seu grafo em `devtools-graph.ts`); as
mensagens são tipadas uma vez em `src/runtime/devtools-protocol.ts` e viajam no
socket de dispositivo do inspector como frames `panel` ao lado do CDP, pelo que o painel e uma
janela do DevTools depuram o mesmo runtime lado a lado. Uma mensagem que o kernel
não pode aceitar é recusada com a sua razão, mostrada no cabeçalho do painel. Depois de um
recarregamento, o runtime novo saúda o painel, que recomeça com a sua árvore.

Ainda não suportado: editar as props de um componente (edite a prop da vista ou
o sinal por trás dela em vez disso), as fontes próprias de um computed, e ver o
código-fonte de um componente.

### Gravação e repetição

As compilações de desenvolvimento gravam cada lote que o runtime da aplicação faz commit, tal como o
kernel o escreveu (o lote de host tipado do [agendamento nativo](native-scheduling.md)),
desde o momento em que o runtime arranca. Um job que lança perde os seus lotes no
dispositivo e na gravação da mesma forma.

Prima `s` no `kuito dev` (ou envie `record` para uma sessão não interativa) para
guardar a gravação de cada dispositivo ligado em
`.kuito/recordings/<time>-<device>.krec`, com a árvore de vistas nativa que construiu
ao lado como `<file>.tree`: uma linha por vista, por ordem de id, com o seu tipo, o seu
pai, a frame que o motor de layout lhe deu, e o texto de uma vista de texto. Uma linha
de lista aparece sem a sua frame: a plataforma dispõe uma linha quando a sua lista a
mostra, o que segue o scroll da própria lista e não os lotes.

```bash
kuito replay .kuito/recordings/20261019-014618-p17-iphone-18-pro.krec ios
```

`kuito replay` compila e lança a shell como o `kuito dev` faz, mas a
shell não inicia nenhuma aplicação nem nenhum runtime Hermes: o servidor de desenvolvimento envia-lhe a
gravação, e ela aplica os lotes através do mesmo pipeline de frames, ao
ritmo a que foram gravados. Quando o último está no ecrã, a shell
descreve a sua árvore de vistas, a CLI guarda-a como `<file>.replayed`, e reporta
se corresponde ao `.tree` gravado ou a primeira linha em que difere.

O que uma repetição não reproduz:

- **Código da thread de UI.** Os valores de movimento, os gestos e as animações correm no runtime
  de UI, que uma repetição não inicia; os seus registos ficam de fora.
- **Estado nativo.** Os deslocamentos de scroll, o texto escrito nos campos e outro estado que a
  plataforma detém não estão nos lotes; nem os eventos nativos a que a aplicação
  respondeu. A árvore compara o layout, não onde uma scroll view está deslocada.
- **Tamanho.** Uma gravação para aos 32 MB, e di-lo (a CLI anota
  "stopped at its size limit"); ainda assim repete desde o início.

Um ficheiro `.krec` é little-endian: `KREC`, uma versão (2), uma flag de truncado, depois
para cada lote os milissegundos desde que o runtime arrancou, os bytes do lote
e as suas strings (`native/shared/Recording.h`). As props atravessam pelo seu número
no manifesto, pelo que uma gravação é repetida numa shell compilada a partir do mesmo
Kuito, na plataforma que a gravou; a sua árvore é a dessa plataforma.

### Em pausa

Pausar para uma thread; o resto da aplicação continua tanto quanto pode:

- **Thread de JS**: a UI mantém-se responsiva e as animações na thread de UI
  continuam a correr. Os eventos, os timers e os Live Patches ficam em fila e correm depois de
  retomar.
- **Thread de UI**: o ecrã congela até retomar, pois a thread de UI da plataforma
  é a que está parada. No Android, a entrada durante uma pausa longa pode fazer
  aparecer o diálogo _App isn't responding_ do sistema; escolha _Wait_.

A ligação de desenvolvimento mantém-se ativa em qualquer dos casos: os seus pings são respondidos fora da thread
em pausa, pelo que a shell não se volta a ligar enquanto avança passo a passo.

### Como funciona

Cada runtime recebe o agente CDP do próprio Hermes (`hermes/cdp`), pelo que o Kuito não fala
CDP por si. A shell abre um segundo socket para o servidor de desenvolvimento,
`/inspector/device`, numa thread própria: os comandos chegam a um runtime mesmo
enquanto a thread desse runtime está parada num breakpoint. O servidor de desenvolvimento
(`src/dev/inspector-proxy.ts`) retransmite CDP entre esse socket e cada
janela do DevTools, e acrescenta uma coisa pelo caminho: o source map de cada Live Patch,
inline, pelo que qualquer frontend mapeia os scripts de volta ao TypeScript sem ir buscar
nada.

Uma sessão do DevTools sobrevive ao runtime que depura. Recarregue a partir do menu de desenvolvimento,
ou qualquer outra coisa que traga um runtime novo, e a sessão passa para ele
com os seus breakpoints: o DevTools limpa os scripts do runtime antigo, como numa
navegação de página, e lista os do novo.

O agente do Hermes não guarda nenhum código-fonte de script, por isso o servidor de desenvolvimento responde ao DevTools
por ele: cada Live Patch, os kernels, e o bundle da thread de UI, que o
compilador nomeia pelo seu conteúdo (`kuito://ui/<hash>`) e escreve ao lado dos
patches. No iOS, o runtime de JS corre numa thread própria em vez de numa
dispatch queue, porque o profiler de CPU amostra a thread que registou
o runtime.

### Limites

- Os breakpoints num ficheiro que edita são descartados quando o seu Live Patch assenta: o
  código do ficheiro mudou por baixo deles. Os breakpoints noutros ficheiros transitam.
- O código da thread de UI aparece como o JavaScript gerado pelo compilador: o seu bundle
  ainda não tem source map.
- O runtime headless que executa as tarefas em segundo plano não é depurável.
- Só uma janela do DevTools depura um runtime de cada vez: abrir outra fecha
  a primeira.
- As compilações de release não incluem nada disto: o inspector só compila em
  compilações de debug (`KUITO_INSPECTOR`), e o Hermes de release do Android não tem
  depurador.
