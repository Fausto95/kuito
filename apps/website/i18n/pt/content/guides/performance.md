# Desempenho

Como medir a taxa de frames do Kuito no Android e o arranque a frio em ambas as plataformas, e o que os números significam.

## O benchmark de frames no Android

`scripts/benchmark-android.ts` reproduz a demo Reel (`demo/app.tsx`) num emulador ou dispositivo com gestos `input` no próprio dispositivo. Cada execução arranca a aplicação a frio, e cada cenário começa quando a aplicação fica inativa.

- `launch`: arranque a frio, depois o catálogo, os posters e o layout, até a aplicação ficar inativa
- `sheet`: abre e fecha duas vezes o Sheet de detalhes
- `tabs`: Search, Library, Lab, Discover, duas vezes
- `discover`: desliza dois rails, faz scroll do Discover para baixo e volta a subir
- `library`: faz scroll da Library seis ecrãs para baixo e volta

Inicie o servidor de desenvolvimento para o dispositivo, o que também instala a aplicação, e deixe-o a correr. Depois meça a aplicação instalada:

```sh
kuito dev android -d emulator-5554 --port 8766
node scripts/benchmark-android.ts --device emulator-5554 --port 8766 --runs 3 --label mine
```

Para comparar duas builds, passe ambos os APKs. Alternam dentro de cada execução, pelo que a carga no host recai sobre ambas da mesma forma:

```sh
node scripts/benchmark-android.ts --runs 4 --build before=before.apk --build after=after.apk
```

`--scenario discover` corre um cenário, e `--report` imprime de novo o resumo de uma execução anterior. Os resultados vão para `dist/benchmarks/android/<label>/`: `results.json`, e um ficheiro de texto atrace por cenário e execução (cerca de 60 MB cada). Abra um trace no [Perfetto](https://ui.perfetto.dev) para o ver.

## O que reporta

Por cenário, a mediana entre execuções de:

- De `dumpsys gfxinfo`: frames renderizadas, % de jank (frames que falharam o seu prazo), tempo de frame p50/p90/p99. É o que um utilizador vê, mas num emulador é dominado pela GPU do host.
- Da thread de UI do trace: `uiSlowPercent` (frames cujo próprio tempo na thread principal excede 16,7 ms), `uiP90`, `uiMaxMs` e `uiTotalMs`. É o trabalho que o renderizador do Kuito controla, e é muito menos ruidoso.
- `startMs` (apenas launch): tempo até ao primeiro desenho da activity.
- `contentMs` (apenas launch): do primeiro evento traçado do processo até ao fim do seu maior `Kuito commit`: o tempo que um utilizador espera pelo conteúdo.
- `anrs`: relatórios de "Application Not Responding".

## Arranque a frio

Ambas as shells arrancam a partir de bytecode Hermes: o kernel e a aplicação chegam compilados, por isso o Hermes não os analisa nem compila. `contentMs` inclui o pedido do Reel à API do TVMaze, que varia em centenas de milissegundos entre execuções. Compare medianas entre várias execuções.

No iOS, `scripts/benchmark-ios.ts` mede a mesma linha temporal de `launch` num simulador. Construa e instale a shell (`kuito dev ios`), depois:

```sh
node scripts/benchmark-ios.ts --device "iPhone 18 Pro Max" --runs 7 --label mine
```

Sem `--port` a aplicação arranca offline, apenas a partir do seu bytecode incluído. A primeira execução depois de uma instalação paga as caches de ficheiros frias. Os resultados vão para `dist/benchmarks/ios-launch-<label>.json`.

## Contadores do kernel

`__kuito.stats()` devolve uma fotografia do trabalho que o kernel fez, para que um teste ou uma sessão de depuração compare duas fotografias à volta de uma interação: `replans`, `thunkEvaluations`, `subscriptionsCreated`, `subscriptionsDestroyed`, `sendPropCalls` e `bytesStringified`. `total` guarda-os desde que o kernel carregou; `lastReplan` guarda o que o último `patch()` com commit fez.

## O que distorce as medições

- Overlays das devtools: o monitor de desempenho e o realçador de atualizações redesenham a janela por si próprios. O benchmark desliga ambos durante a execução e repõe as suas definições depois; `--overlays` mantém-nos ligados para os medir.
- Número de CPUs do emulador: o AVD Pixel 3a de origem em Apple silicon tem `hw.cpu.ncore = 1`. Aumente-o no `config.ini` do AVD para números mais próximos de um telemóvel; mantenha-o fixo entre o antes e o depois.
- A GPU do host: cada frame do emulador passa pela GPU do host, partilhada com todos os outros emuladores e simuladores a correr. Compare os números da thread de UI, alterne as builds e feche os outros emuladores.
- Builds de debug: o benchmark mede APKs de debug, tal como o `kuito dev` os constrói. Compare builds do mesmo tipo.

## Em profundidade

[Desempenho](../../../../docs/performance.md) cobre as secções de trace que a shell marca, cada contador do kernel, os contadores nativos por trás do monitor de desempenho e como construir um APK para comparar.
