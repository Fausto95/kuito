# Fatia vertical do Hermes no dispositivo (experimental)

Isto é um **protótipo de implementação**, não uma versão móvel validada.

## Objetivo

Executar o bootstrap do Kuito, a reatividade da UI, os manipuladores de eventos e o código-fonte da aplicação **dentro de cada processo móvel nativo**, em vez de executar JS no desktop e espelhar os eventos de UI por WebSocket.

- O `native/shared/KuitoRuntime.{h,cpp}` partilhado incorpora um `facebook::hermes::HermesRuntime` persistente e prepara mutações de vista tipadas numa fila C++. Após cada entrada na VM, descarrega um lote, deduplicando escritas repetidas de propriedades sem reordenar a criação/remoção de vistas.
- No Android, `KuitoJNI.cpp` e `KuitoNativeRuntime.kt` detêm o Hermes num `HandlerThread`, entregam um lote em array JNI por tarefa da VM, e aplicam as mutações ao `KuitoAndroidRenderer` no Looper principal. A build nativa do Gradle consome o prefab Hermes V1 de `com.facebook.hermes:hermes-android` e constrói `libjsi.so` a partir de `API/jsi` do Hermes na tag da mesma versão (`native/android/app/src/main/cpp/jsi`, cujo `jsi/jsi/VERSION` nomeia o commit), a ABI contra a qual `libhermesvm.so` é ligado. Nenhuma biblioteca React Native é empacotada.
  - Uma exceção Kotlin durante uma chamada ao host (um pedido, um temporizador, um módulo nativo, um log) é limpa antes de qualquer outra chamada JNI e torna-se um erro JavaScript que nomeia a chamada e a exceção Java (`JavaException.h`), pelo que chega ao `catch` da aplicação ou ao LogBox em vez de abortar o processo.
  - O `Intl` do Hermes no Android (`toLocaleString`, `Intl.DateTimeFormat`, ...) é Java por trás do fbjni, que carrega as suas bibliotecas através do `NativeLoader` do SoLoader. O `KuitoNativeRuntime` inicializa-o antes de o Hermes arrancar: uma exceção dentro do código `Intl` do próprio Hermes nunca chega ao catch do Kuito e aborta o processo.
- No iOS, `KuitoHermesBridge.mm` e `KuitoHermesBridge.h` detêm o Hermes numa fila de dispatch serial, armazenam as mutações de vista e enviam cada lote ordenado ao `KuitoUIKitRenderer` na fila de dispatch principal. Um pacote Swift local liga a mesma versão Hermes V1, pré-construída (`src/cli/hermes-ios.ts`).
- `src/dev/device-server.ts` entrega **apenas patches de código-fonte JavaScript** por um WebSocket restrito ao localhost. Toda a lógica da aplicação e o dispatch dos botões correm dentro da VM do dispositivo.

## Utilização

Instale as dependências Node e os SDKs nativos. No macOS, tenha o Xcode e o XcodeGen. No Android, JDK 21, Android SDK/NDK, CMake, Gradle 8, emulador. `kuito doctor` verifica-os.

```sh
kuito doctor
kuito dev android
# macOS only:
kuito dev ios
```

`kuito build android` constrói o shell Android com os assets JS de bootstrap/aplicação gerados. `kuito dev --no-launch` executa apenas a compilação dos patches de código-fonte.

Para construir sem lançar:

```sh
kuito build ios              # or android: the bundled JS and the shells, in .kuito/ (apps.md)
```

`native/ios` e `native/android` continuam a construir-se por si sós, mas sem o
JS empacotado, que pertence à aplicação a ser construída.

`KUITO_DEV_URL` (iOS) e o extra de intent `kuito_dev_url` (Android) selecionam o transporte de patches em localhost, com o emulador Android a usar `10.0.2.2` e o Android físico a usar `adb reverse`.

## JavaScript versus bytecode Hermes

O Hermes só executa bytecode compilado pela sua própria versão. Ambas as plataformas ligam a mesma versão Hermes V1, fixada uma única vez em `native/hermes.json` (versão, commit da tag, integridade do compilador, checksum do iOS), que a CLI, o Gradle e a CI leem. `test/hermesc.test.ts` falha quando um consumidor repete a fixação ou o JSI incluído é de outro commit.

- **Ambas as plataformas** arrancam a partir de bytecode: `bootstrap.hbc` (o kernel `src/runtime` empacotado) e `app.hbc`, compilados uma vez pelo `hermesc` dessa versão (`src/cli/hermesc.ts`). O compilador é distribuído no pacote npm `hermes-compiler`, pelo que a CLI descarrega o tarball fixado uma vez para `~/.cache/kuito`, verifica o seu hash de integridade e guarda o `hermesc`. O bytecode poupa ao dispositivo a análise e compilação de cerca de 270 KB de script durante o arranque a frio (`docs/performance.md`).
- Os **Live Patches** chegam a ambas como código-fonte.

Os shells empacotam estes assets nas builds de debug para arranque offline, com `app.js` ao lado apenas para reconhecer a repetição da mesma build pelo servidor de desenvolvimento. Reconectar o socket de patches repete o último patch de código-fonte; o runtime persistente conserva o estado e as vistas compatíveis. A compilação do script ou as exceções de runtime são reportadas à UI do dispositivo; um commit cujas chamadas ao host lançam exceções é descartado por inteiro.

## Portões de verificação e critérios de abandono

1. **Gradle/NDK:** o Android tem de compilar/ligar a ponte JSI contra o Hermes e instalar num emulador. Falha: corrigir os alvos prefab do CMake ou a estratégia de empacotamento/ligação antes de adicionar funcionalidades.
2. **Xcode/SwiftPM:** o iOS tem de compilar/ligar a ponte Objective-C++ e arrancar num simulador. Falha: resolver os cabeçalhos da framework fixada, o pacote Hermes e a geração do projeto; nenhuma afirmação sobre o runtime até passar.
3. **Operação no dispositivo:** com o servidor de desenvolvimento parado, um arranque offline mostra `Count: 0`, os toques atualizam a etiqueta localmente, e a UI local permanece responsiva.
4. **Live Patch:** duas versões do código-fonte conservam a contagem, a substituição do manipulador e a identidade das vistas em cada dispositivo. Um erro de sintaxe conserva a última UI funcional. Medir a latência mediana/p95.
5. **Isolamento:** os perfis de release móveis têm de rejeitar o transporte de patches e as definições de programador inseguras. Estes shells de debug NÃO DEVEM ser distribuídos como aplicações de produção.

## Limitações conhecidas

- O código-fonte atual move o Hermes para filas de trabalho seriais dedicadas, pelo que JavaScript dispendioso não monopoliza a thread de UI nativa ([escalonamento nativo](native-scheduling.md)). As mutações do host são armazenadas e entregues de forma assíncrona; a UI nativa e o JS podem observar temporariamente estados diferentes.
- As fontes JSI incluídas no Android têm de acompanhar `native/hermes.json`: atualize ambos em conjunto, ou `libhermesvm.so` e `libjsi.so` discordam sobre a ABI do JSI.
- O transporte de patches para o dispositivo é não autenticado, **apenas em loopback** e estritamente para desenvolvimento de confiança; não há mecanismo OTA de produção.
- Sem AOT de produção, testes de preservação do foco, remontagens estruturais determinísticas, benchmarks de plataforma, nem validação em dispositivo físico.
