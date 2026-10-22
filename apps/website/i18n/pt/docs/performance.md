# Desempenho

Como medir a taxa de frames do Kuito no Android e o arranque a frio em ambas as plataformas,
e o que os números significam.

## O benchmark de frames no Android

`scripts/benchmark-android.ts` reproduz a demo Reel (`demo/app.tsx`) num
emulador ou dispositivo com gestos `input` no próprio dispositivo:

| Cenário    | O que faz                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| `launch`   | Arranque a frio, depois o catálogo, os posters e o layout, até a app ficar inativa                     |
| `sheet`    | Abre e fecha duas vezes o Sheet de detalhes                                                            |
| `tabs`     | Search → Library → Lab → Discover, duas vezes                                                          |
| `discover` | Desliza dois rails, faz scroll do Discover para baixo com um deslize de rail por ecrã, e volta a subir |
| `library`  | Faz scroll da Library seis ecrãs para baixo e volta                                                    |

Cada execução arranca a app a frio. Cada cenário começa quando a app fica inativa, o que
significa que usa menos de um décimo de um núcleo durante dois segundos. Uma espera fixa não
chega: num emulador lento, o primeiro conteúdo pode chegar um minuto depois do arranque.

### Como o correr

Inicie o servidor de desenvolvimento para o dispositivo, o que também instala a app, e deixe-o a correr:

```bash
kuito dev android -d emulator-5554 --port 8766
```

Depois meça a app instalada:

```bash
node scripts/benchmark-android.ts --device emulator-5554 --port 8766 --runs 3 --label mine
```

Para comparar duas builds, passe ambos os APKs. Alternam dentro de cada execução, pelo que a carga
no host (outros emuladores, builds) recai sobre ambas da mesma forma:

```bash
node scripts/benchmark-android.ts --runs 4 --build before=before.apk --build after=after.apk
```

Construa um APK com o JDK 21 e o Gradle 8, depois copie
`native/android/app/build/outputs/apk/debug/app-debug.apk` para um lado antes de construir o seguinte:

```bash
cd native/android && JAVA_HOME=$(/usr/libexec/java_home -v 21) PATH=/opt/homebrew/opt/gradle@8/bin:$PATH gradle :app:assembleDebug
```

`--scenario discover` corre um único cenário, e `--report` volta a imprimir o resumo de uma
execução anterior a partir dos traces guardados. As coordenadas são para um ecrã de 1080×2220 a
480 dpi (Pixel 3a).

Os resultados vão para `dist/benchmarks/android/<label>/`: `results.json`, e um ficheiro de texto
atrace por cenário e execução (cerca de 60 MB cada; apague-os quando terminar).
Abra um trace no [Perfetto](https://ui.perfetto.dev) para o ver.

### O que reporta

Por cenário, a mediana ao longo das execuções de:

- **De `dumpsys gfxinfo`**: frames renderizados, % de jank (frames que falharam o
  prazo), tempo de frame p50/p90/p99. É isto que o utilizador vê, mas num
  emulador é dominado pela GPU do host (ver abaixo).
- **Da thread de UI do trace**: `uiSlowPercent` (frames cujo tempo próprio na thread principal
  excede 16,7 ms), `uiP90`, `uiMaxMs` (o frame mais longo) e `uiTotalMs`.
  O "tempo próprio" exclui `postAndWait`, a espera pela RenderThread. Este é o
  trabalho que o renderizador do Kuito controla, e é muito menos ruidoso.
- `startMs` (só em launch): o tempo de `am start -W` até ao primeiro desenho da activity,
  que é o ecrã de arranque.
- `contentMs` (só em launch): do primeiro evento traçado do processo ao fim
  do seu maior `Kuito commit`. Na Reel é o catálogo: o tempo que um utilizador
  espera pelo conteúdo.
- `evaluateMs` (só em launch): o tempo de relógio de todos os `Kuito evaluate`. Num único
  núcleo é sobretudo espera pelo núcleo, não o Hermes a correr.
- `anrs`: relatórios "Application Not Responding" durante o cenário.

`results.json` também guarda as 40 maiores secções da thread principal de cada execução.

### Secções do trace

A shell e o renderizador marcam o seu trabalho para que um trace o atribua:

| Secção                | Thread | O quê                                                       |
| --------------------- | ------ | ----------------------------------------------------------- |
| `Kuito commit <rows>` | main   | Aplicar um lote de mutações vindo do Hermes                 |
| `Kuito layout`        | main   | Uma passagem do motor de flexbox sobre a raiz               |
| `Kuito measureLeaf`   | main   | O motor a pedir ao Android que meça um texto ou um controlo |
| `Kuito image ready`   | main   | Entregar uma imagem descodificada às suas vistas            |
| `Kuito image decode`  | worker | Descodificar os bytes de uma imagem                         |
| `Kuito evaluate`      | Hermes | Correr um script: o kernel, a app, um patch                 |
| `Kuito dispatch`      | Hermes | Entregar um evento ao JS                                    |
| `Kuito timer`         | Hermes | Um timer de JS a disparar                                   |

Um número no fim é detalhe: o benchmark soma todos os `Kuito commit`.

## Arranque a frio

Ambas as shells arrancam a partir de bytecode Hermes (`docs/on-device-hermes.md`):
o kernel e a app chegam compilados, pelo que o Hermes não os analisa nem compila.
No emulador do Pixel 3a, isso baixou o tempo próprio do Hermes em `Kuito evaluate`
de cerca de 46 ms para 9 ms por arranque. `evaluateMs` fica bem acima disso: num único
núcleo, a thread do Hermes passa a maior parte de um evaluate à espera enquanto a thread principal
desenha o primeiro frame. Qualquer outra coisa que corra durante o arranque, como um
ecrã de arranque animado, prolonga essa espera. Esse bytecode é compilado
para depuração, sem otimizações e com informação de depuração completa, para que o Chrome DevTools consiga
mostrar todos os scopes ([devtools](devtools.md#debugging-with-chrome-devtools)).

`contentMs` inclui também o pedido da Reel à API TVMaze, que varia em
centenas de milissegundos entre execuções. Compare medianas ao longo de várias execuções.

### iOS

`scripts/benchmark-ios.ts` mede a mesma linha temporal de `launch` num
simulador iOS. A shell marca `Kuito evaluate` e `Kuito commit <mutations>` como
signposts em Points of Interest (`native/ios/App/KuitoTrace.swift`); o script
lê-os a partir do `log stream` do simulador, e cronometra `contentMs` a partir do
primeiro evento de log do processo. Construa e instale a shell (`kuito dev ios`), depois:

```bash
node scripts/benchmark-ios.ts --device "iPhone 18 Pro Max" --runs 7 --label mine
```

Sem `--port`, a app arranca offline, apenas a partir do bytecode incluído. A
primeira execução depois de uma instalação paga o custo das caches de ficheiros frias; compare medianas.
Os resultados vão para `dist/benchmarks/ios-launch-<label>.json`. Os números registados vivem
em `benchmarks/`.

## Contadores do kernel

`__kuito.stats()` devolve um instantâneo do trabalho que o kernel fez, para que um
teste ou uma sessão de depuração compare dois instantâneos em torno de uma interação:

| Contador                 | Conta                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `replans`                | Execuções de `patch()` confirmadas, incluindo o primeiro plano de cada módulo                                                                 |
| `thunkEvaluations`       | Expressões seguidas executadas: `when`s, expressões de filhos, props computadas                                                               |
| `subscriptionsCreated`   | Subscrições de sinais criadas                                                                                                                 |
| `subscriptionsDestroyed` | Subscrições de sinais libertadas                                                                                                              |
| `sendPropCalls`          | Props enviadas ao host, incluindo as animadas e as ligadas à thread de UI                                                                     |
| `bytesStringified`       | Comprimento do JSON produzido para atravessar a fronteira do host (props, operações na thread de UI, argumentos de módulos nativos, comandos) |

`total` guarda os cinco contadores de trabalho desde que o kernel carregou; `lastReplan`
guarda o que o último `patch()` confirmado fez, do registo até aos seus
mounts. Um `patch()` que lança uma exceção não confirma nada e deixa `lastReplan` como
estava. Os testes leem-nos através de `installKernel` (`test/support/kuito-host.ts`).

`held` conta o que o kernel guarda neste momento, armazenamento a armazenamento: `states` de hooks,
`motions`, as funções da thread de JS (`remotes`) e os `signals` que a thread de UI
pode chamar ou escrever, tags de gestos, vistas removidas mantidas pelos seus eventos tardios,
`views` e `handlers`. Cada um mantém-se estável enquanto uma app também o está: o estado de um hook
dura tanto quanto a sua instância (`docs/reactivity.md`), um remote ou um sinal
enquanto o plano confirmado de algum módulo o codificar, e descartar um módulo liberta
tudo isso. O kernel de UI responde à mesma pergunta para os seus próprios armazenamentos com
`__kuitoUI.stats()`: `functions`, `motions`, `handlers` e
`bindings` da thread de UI. `test/demo.test.ts` e `test/motion-app.test.ts` mantêm ambos estáveis
ao longo de 200 Live Patches.

## Contadores nativos

A última linha do monitor de desempenho (`JS · 12 parses/commit · touch 48 ms (p95
61)`) conta dois custos que os renderizadores pagam por cada commit do Kuito, da mesma forma
no iOS e no Android (`KuitoCommitStats`, `KuitoParses`):

- **Parses por commit.** O lote do host tipifica o valor de todas as props incorporadas
  (docs/native-scheduling.md), pelo que os setters incorporados não analisam texto. As props próprias
  de uma vista de módulo nativo chegam como escalares; os helpers de cor que usam
  (`UIColor(kuitoHex:)`, `cssColor`) contam cada parse. As props JSON analisam
  o seu JSON por contrato e não são contadas. Mostrado como a média ao longo da janela de meio
  segundo do monitor, para os lotes aplicados nela; as props conduzidas pela thread de UI não são commits
  e não são contadas.
- **Latência do toque até à aplicação.** Desde um toque a descer ou a subir (o timestamp do próprio
  evento, lido pela janela antes de qualquer vista o ver) até ao fim da aplicação
  do primeiro lote que a thread de JS enviou depois dele. Um toque posterior substitui um ainda
  à espera; um toque a que nenhum lote responde em 5 s é descartado, uma vez que não enviou
  nada para aplicar. O p95 é sobre os últimos 64 toques respondidos. Um lote que a
  thread de JS enviou depois do toque por outro motivo (um timer) também lhe responde.

## O que distorce as medições

- **Overlays de devtools.** O monitor de desempenho e o realçador de atualizações redesenham
  a janela por si próprios, e um emulador sem atualizações parciais redesenha-a toda
  de cada vez. O benchmark desliga ambos através de `run-as` durante a execução e
  restaura as suas definições no fim, mesmo quando é interrompido; `--overlays` mantém-nos
  ligados para os medir. Na imagem do Pixel 3a, acrescentaram cerca de um terço ao tempo
  da thread de UI do Discover.
- **Número de CPUs do emulador.** O AVD de série do Pixel 3a em Apple silicon tem
  `hw.cpu.ncore = 1`: a thread de UI, a RenderThread, o Hermes e a descodificação de imagens
  partilham um núcleo, e uma thread de UI com trabalho pode passar a maior parte de um frame
  à espera desse núcleo. Aumente-o no `config.ini` do AVD para números mais próximos
  de um telemóvel; mantenha-o fixo entre o antes e o depois.
- **A GPU do host.** Todos os frames do emulador passam pela GPU do host, partilhada
  com todos os outros emuladores e simuladores a correr. `eglSwapBuffers` e
  `dequeueBuffer` dominam então a RenderThread e o jank do gfxinfo varia muito
  entre execuções da mesma build. Compare os números da thread de UI, alterne as builds
  e feche os outros emuladores.
- **Builds de depuração.** O benchmark mede APKs de depuração, tal como o `kuito dev` os
  constrói. Compare builds do mesmo tipo.
