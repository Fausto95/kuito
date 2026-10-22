# CLI do Kuito — do simulador ao código-fonte num único comando

A CLI é o ponto de entrada previsto para o ciclo de desenvolvimento nativo do Kuito. Descobre dispositivos, arranca um iOS Simulator ou um Android Emulator, compila a shell nativa de desenvolvimento relevante, instala a aplicação, lança-a e inicia o watcher de Live Patch do Rolldown/Oxc. **Não** precisa de abrir o Xcode nem o Android Studio para executar a aplicação, mas os SDKs subjacentes da Apple/Android têm de estar instalados.

## Início rápido

```sh
kuito doctor
kuito devices
kuito dev ios
kuito dev android --device Pixel_9
```

`kuito` executa a aplicação no diretório em que é iniciado, que precisa de um `kuito.config.ts`; neste checkout é `demo/` (`cd demo && kuito dev ios`). A entrada por padrão é `./app`. Para usar outra entrada: `kuito dev ios --entry navigation.tsx` em `demo/`. Para uso headless: `kuito devices --json` ou indique `--device` (só é mostrado um prompt quando há vários dispositivos disponíveis e existe um TTY real). `kuito --help` mostra todos os comandos e opções.

## Criar uma aplicação

```sh
kuito create MyApp     # alias: kuito init MyApp
cd MyApp
kuito dev ios          # or: kuito dev android
```

`kuito create <name>` escreve uma aplicação nova em `./<name>` e corre `npm install`
aí (`--no-install` salta-o). O nome começa por uma letra e contém
letras, dígitos, `-` e `_`; nomeia o diretório e, em minúsculas, o pacote
npm. Um diretório existente tem de estar vazio: `create` nunca sobrescreve ficheiros.

```text
MyApp/
  package.json     scripts ios / android / start; depends on kuito
  kuito.config.ts native settings: name, ids, icon, a staging environment (docs/apps.md)
  assets/          icon.png, icon-staging.png and splash.png
  tsconfig.json    Kuito's JSX settings, for the editor and tsc
  README.md
  .gitignore       includes .kuito/, the generated shells
  modules/         the app's native modules (kuito module create)
  app/             file-based routes (docs/navigation.md)
    _layout.tsx                    Home and Explore tabs, platform symbols
    (home)/index.tsx               image, state, a motion animation, links
    (explore)/explore.tsx          a List of topics
    (explore)/explore/[topic].tsx  each topic with a live demo
    about.tsx                      a sheet
    _components/                   shared components, topics and demos
```

O modelo vive em `templates/app`, `kuito.config.ts` incluído, com o nome da aplicação
e os ids `com.example.<name>` preenchidos; `package.json` e `tsconfig.json` são
escritos por `src/cli/create.ts`.

**De onde vem o Kuito.** `kuito create` adiciona o pacote `kuito` publicado como
dependência da aplicação e instala-o. Esse pacote fornece os imports, os tipos
e o comando `kuito`. Atualizar é mudar de versão.

**As shells nativas ficam no framework.** A aplicação não faz commit de nenhum projeto nativo.
`kuito dev` e `kuito build` geram as suas shells a partir dos `native/ios` e
`native/android` do framework, configuradas por `kuito.config.ts`, no
`.kuito/` da aplicação (no gitignore), e instalam-nas sob o nome e os ids
próprios da aplicação. Copiar os projetos nativos para cada aplicação bifurcá-los-ia à primeira
alteração do framework; em vez disso, atualizar é um incremento de versão. [Projetos de aplicação](apps.md)
cobre a estrutura, as chaves de configuração e como as shells são geradas.

**Ambientes.** `--env <name>` compila um dos ambientes da configuração:
`kuito dev ios --env staging` instala a aplicação de staging do modelo inicial, com o seu próprio
nome, ícone e ids, ao lado da de produção. `kuito dev` usa por padrão
`development` e `kuito build` `production` ([ambientes](apps.md#environments)).

**Entrada.** `--entry` é relativo ao diretório em que o `kuito` corre. Sem ele,
`kuito dev` executa `./app`: o diretório `app/` quando existe, e caso contrário
`app.tsx`. O `demo/` deste checkout tem um diretório `app/`, o Reel. O servidor de Live Patch corre nesse diretório também,
pelo que o LogBox abre os ficheiros da aplicação e a sessão mostra caminhos relativos a ele.

## Experiência interativa

`kuito dev` abre um seletor de dispositivos com filtro por escrita quando existem vários alvos (os arrancados primeiro, depois o runtime mais recente; `--device` aceita um nome exato como `"iPhone 18 Pro"`). A sessão imprime depois uma linha consolidada por passo — dispositivo arrancado, aplicação nativa compilada, Live Patch iniciado, aplicação lançada — seguida de uma linha por edição:

```
02:05:14  ✔ patched   app.tsx  rev 2 · 18ms
02:05:14  ✔ applied   app.tsx → iPhone 18 Pro  rev 2 · 142ms from save · eval 9ms
02:05:40  ✖ rejected  app.tsx:12:4
            Unexpected token
             12 |   return (,
            previous version stays live
```

`patched` é a compilação: a sua revisão e quanto tempo a compilação demorou, ou `no device
connected` quando não chegou a nenhum. Cada dispositivo confirma depois a revisão por si
([a ligação de desenvolvimento](devtools.md#the-dev-link)): `applied` nomeia o dispositivo e o
tempo desde guardar o ficheiro até esse dispositivo ter avaliado o patch, e um
patch que lança num dispositivo mostra `rejected on <device>` com o erro.
Sob o feed, uma linha por dispositivo ligado mostra a última revisão que ele confirmou;
sem nenhum dispositivo ligado, não há nenhuma.

Uma barra persistente lista os atalhos de tecla única: `r` recompilar e relançar, `l` alternar os registos do dispositivo, `d` mudar de dispositivo, `m` abrir as devtools no dispositivo ([devtools](devtools.md)), `j` depurar a thread de JS no Chrome DevTools (`u` para a thread de UI, [depuração](devtools.md#debugging-with-chrome-devtools)), `k` o painel Components ([components](devtools.md#components)), `s` guardar uma gravação para `kuito replay` ([gravação](devtools.md#recording-and-replay)), `c` limpar, `?` ajuda, `q` sair; `kuito help` lista a mesma tabela. As cores são as cores ANSI nomeadas do próprio terminal, pelo que os temas claros e escuros continuam legíveis. A saída da compilação fica oculta a menos que `--verbose` esteja definido; um passo que falha mostra o seu resumo e as linhas da saída da ferramenta que nomeiam o erro. Os erros de compilação — num passo de arranque (o motor de dispositivo compila a aplicação primeiro) ou numa edição rejeitada — mostram `file:line:column`, o code frame e o compilador que os reportou (por exemplo `reported by the styles() compiler`); os erros sem linha nomeiam na mesma o ficheiro.

O compilador de Live Patch mantém-se ativo entre edições: uma recompilação volta a correr as transformações do Kuito apenas para os módulos cujo código-fonte mudou, e uma compilação cuja saída é igual à anterior (um comentário, um export não usado) é a mesma revisão e não envia nenhum patch.

O código nativo também é recarregado. Guardar um ficheiro `.swift`, `.kt` ou `.ts` sob o `modules/` da aplicação recompila a shell incrementalmente e relança a aplicação, e o mesmo faz um Live Patch que chama uma função de módulo nativo que a shell em execução não ligou ([módulos nativos](native-modules.md#4-use-it)). As edições de TypeScript continuam a ser Live Patches.

A CLI vigia a aplicação lançada. Quando ela falha, a sessão mostra a causa e as frames de topo — a partir do relatório de falha do macOS (`~/Library/Logs/DiagnosticReports`) para o iOS Simulator, e a partir de `adb logcat -b crash` para exceções Java e tombstones nativos no Android — e oferece `r` para recompilar e relançar. Uma aplicação que termina sem falhar (por exemplo, fechada por deslize) só produz um aviso.

Sem um TTY (CI, pipes), o mesmo feed é impresso como linhas simples, o stdin aceita `quit` e passa `devtools`, `components` e `debug js|ui` ao servidor de desenvolvimento, e uma falha termina o comando com o código de saída 1.

A saída de `console` da aplicação aparece na sessão na linha de código-fonte que a registou, e o [LogBox](logbox.md) abre as frames no editor nomeado por `KUITO_EDITOR`.

A CLI fala com o servidor de Live Patch através de eventos JSON delimitados por nova linha (`KUITO_EVENTS=ndjson`): `ready`, `patched` (revisão, duração da compilação, ficheiros editados, se é a compilação inicial, quantos dispositivos alcançou, os módulos nativos que o bundle requer), `unchanged` (uma recompilação com a mesma saída; nada enviado), `rejected` (diagnósticos com ficheiro, linha, coluna e code frame), `device:connected` e `device:disconnected` (o id, o nome e a plataforma de um dispositivo), `device:applied` (revisão, tempo de avaliação no dispositivo, e o tempo desde a edição até esta confirmação) e `device:rejected` (revisão, código, mensagem) para a confirmação de cada dispositivo ([a ligação de desenvolvimento](devtools.md#the-dev-link)), `console` (nível, mensagem, ficheiro, linha, coluna), `error` e `state`. `kuito dev` mantém a saída legível por humanos.

Outros comandos:

- `kuito create <name>`: uma aplicação nova ([acima](#create-an-app)).
- `kuito module create <Name>`: um módulo nativo em `./modules/<name>` (kebab case): a sua especificação TypeScript, Swift e Kotlin ([módulos nativos](native-modules.md#write-your-own-module)).
- `kuito build ios|android`: compilar sem lançar um emulador nem iniciar o Live Patch.
- `kuito devices`: mostrar os simuladores/emuladores em execução e os AVDs Android instalados e parados.
- `kuito doctor`: o que a compilação precisa e falta nesta máquina, com a forma de corrigir cada item.
- `kuito logs ios|android --device ...`: transmitir os registos da plataforma.
- `kuito replay <file.krec> [ios|android]`: repetir uma gravação guardada numa shell que não executa nenhuma aplicação ([devtools](devtools.md#recording-and-replay)).
- `kuito dev ios --no-launch --port 9000`: executar apenas o servidor de Live Patch. Cada plataforma tem
  o seu próprio bundle ([plataformas](styles.md#platforms)), pelo que uma sessão serve os dispositivos de uma
  plataforma e precisa que ela seja nomeada; um dispositivo da outra plataforma é reportado como um erro.

## Pré-requisitos de SDK

No **macOS**, instale o Xcode e o seu runtime de simulador e o `xcodegen` (tipicamente `brew install xcodegen`). A CLI usa `xcrun simctl` para arrancar/instalar/lançar e `xcodebuild` para compilar. A assinatura de código está desativada para compilações de simulador.

Para **Android**, instale o JDK 21, as platform tools do Android SDK (`adb`), o emulador e um AVD, e o Gradle 8 (ou adicione `native/android/gradlew`). Usa o Gradle, `adb install`, `adb shell am start` e `emulator -avd`; o `adb` e o `emulator` vêm de `$ANDROID_HOME` (ou `$ANDROID_SDK_ROOT`) quando definido, caso contrário do `PATH`. Em dispositivos físicos usa `adb reverse` para alcançar o servidor de desenvolvimento local; no emulador Android usa `10.0.2.2`. `kuito doctor` verifica o Node, o Xcode, o XcodeGen, o adb, o JDK e o Gradle, nas versões que `src/cli/requirements.ts` declara uma única vez (o mínimo do Node é o `engines` do `package.json`); não instala pacotes de SDK nem substitui o licenciamento de programador/a configuração do SDK. Um emulador que o `kuito` inicia escreve a sua saída em `kuito-emulator-<avd>.log` no diretório temporário: se terminar antes de arrancar, o arranque falha com essa saída. Um arranque que falha ou é cancelado para-o; um já arrancado continua a correr depois de o `kuito` terminar.

## Ligação da aplicação

A CLI passa `KUITO_DEV_URL` ao processo do iOS Simulator usando `SIMCTL_CHILD_KUITO_DEV_URL`, e `kuito_dev_url` como um intent extra da Activity do Android. `--port` configura tanto o servidor de desenvolvimento como o URL da aplicação. O servidor de desenvolvimento escuta em loopback, e um dispositivo físico Android usa a inversão de porta. Não o exponha numa rede não fidedigna.

## Âmbito e trabalho restante

Esta CLI automatiza o desenvolvimento contra as **shells de UI nativas** do Kuito. Não é uma aplicação Kuito autónoma compilada no dispositivo, um serviço de distribuição de binários de produção, nem um substituto para um Xcode/Android SDK instalado. A compilação/lançamento no simulador iOS e a instalação/lançamento no Android têm de ser verificados em máquinas anfitriãs reais: a CI em Linux não consegue validar uma execução do Xcode. O AOT do Typed Static Hermes é uma experiência à parte.

## Hermes no dispositivo

`kuito dev ios|android` compila os recursos JS de bootstrap e da aplicação, compila a aplicação móvel com a ponte Hermes/JSI, instala-a/lança-a, e inicia um servidor de patches de código-fonte em localhost. O JavaScript corre em **cada processo do dispositivo**; o computador só empacota o TSX e envia patches de código-fonte. A compilação nativa continua a precisar do Hermes. Ambas as plataformas ligam a mesma release pré-compilada do Hermes V1 (a linha static_h), fixada em `native/hermes.json`: o iOS liga o seu xcframework (`com.facebook.hermes:hermes-ios`, variante de debug) como um pacote Swift local: a CLI descarrega o tarball uma vez, verifica-o contra `iosSha256`, e desempacota-o com um `Package.swift` gerado em `~/.cache/kuito/hermes-ios-<version>`, do qual o projeto gerado depende (`src/cli/hermes-ios.ts`). O Maven distribui um tarball e os binary targets remotos do SwiftPM têm de ser zips, daí o pacote local; o Android liga `com.facebook.hermes:hermes-android`. Leia as [ressalvas no dispositivo](on-device-hermes.md).
