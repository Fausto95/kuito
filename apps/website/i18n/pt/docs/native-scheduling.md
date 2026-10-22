# Agendamento nativo e o lote do host

O Hermes chama C++ no mesmo processo através de JSI; não há uma bridge
serializada. Cada trabalho JS (uma avaliação, um evento, um temporizador, a
conclusão de um pedido de rede, o callback de um módulo) envia à plataforma no
máximo um lote de mutações de vistas tipadas, e a plataforma aplica os lotes por
ordem na sua thread de UI.

## Threads

- Android: uma `HandlerThread("KuitoHermes")` cria, executa e destrói o
  runtime do Hermes. O looper principal é dono de todas as Views. Os
  temporizadores e as conclusões do OkHttp são reenviados para a thread do
  Hermes.
- iOS: uma fila serial `dev.kuito.hermes` é dona do runtime, das avaliações,
  dos eventos, dos temporizadores e das conclusões do URLSession. Os lotes vão
  para a fila principal.
- O runtime da thread de UI (docs/motion.md) corre na thread de UI da
  plataforma, ao lado das vistas; as props que escreve são aplicadas antes de o
  seu ponto de entrada retornar.

## O lote: uma chamada por trabalho

O kernel escreve cada mutação de vista de um trabalho como um registo num único
`ArrayBuffer` (`src/runtime/wire.ts`) e envia-o com uma única chamada,
`__kuitoHostCommit(buffer, byteLength, strings)`. O C++ descodifica-o uma vez
em `Mutation`s tipadas (`native/shared/Wire.h`, `Mutation.h`).

Os registos são little-endian e compactados; as strings viajam ao lado do buffer
e um registo refere-as por índice:

| Op           | Campos                                                            |
| ------------ | ----------------------------------------------------------------- |
| 1 `Create`   | `u32 id`, `u32 parent` (0: a raiz), tipo, etiqueta, `u8` achatado |
| 2 `Remove`   | `u32 id`                                                          |
| 3 `Move`     | `u32 id`, `u32 parent`, `u32 index`                               |
| 4 `Flatten`  | `u32 id`, `u8` achatado                                           |
| 5 `Prop`     | `u32 id`, `u16 key` (0xffff: segue-se um nome), valor             |
| 6 `Command`  | `u32 id` (0: a aplicação), nome, argumento                        |
| 7 `UI`       | um array JSON de operações da thread de UI                        |
| 8 `UIScript` | código-fonte, url                                                 |

Um valor é uma tag e a sua carga: null, um número `f64`, false, true, texto,
texto JSON, ou um diff de chaves. Um diff de chaves é uma contagem `u32` e
depois cada edição como uma op `u8` (inserir, remover, mover), um índice `u32` e
a chave: as chaves de uma lista como edições às chaves enviadas antes
(docs/lists.md#keys). Só uma prop do tipo `keys` do manifesto aceita um, e tal
prop não aceita mais nada senão null.

A chave de uma prop é o índice da prop em `src/protocol/manifest.ts`
(`native/shared/PropKeys.generated.h`, as `PROP_KEYS` do kernel); a prop
própria da vista de um módulo vai pelo nome. As vistas são números que o kernel
atribui e nunca reutiliza; a etiqueta (o `id` da aplicação, ou o caminho do
kernel) atravessa uma única vez, com a criação, para as mensagens de erro e para
uma lista adotar a célula que pediu.

O C++ tipa cada valor pelo tipo da sua prop no manifesto: uma cor chega como
texto hexadecimal e é analisada uma vez para `0xRRGGBBAA`, um enum torna-se o
seu índice entre os valores do manifesto, um número tem de ser um número. Um
valor do tipo errado rejeita o lote, nomeando a prop.

Quando o lote parte:

- Um commit (`src/runtime/transaction.ts`) envia os seus registos sozinhos,
  quando o seu trabalho termina: um lote que o host rejeita é exatamente o
  commit que o kernel desfaz.
- As outras escritas (o novo valor de um binding, o `setProperty` de um
  elemento, um comando) esperam que o scope à sua volta termine, o despacho de
  um evento nativo, e partem de imediato fora de qualquer um.
- As operações da thread de UI vão com o lote seguinte, depois das vistas que
  referem; sem lote a caminho, no fim da tarefa.

## A tabela de vistas

`native/shared/ViewTable.{h,cpp}` guarda `id → { kind, label, parent }` para
cada vista que os lotes construíram, e verifica cada lote contra ela antes de
qualquer parte dele chegar à plataforma. Rejeita, por inteiro:

- a criação de um id que existe,
- uma inserção (uma criação ou um movimento) sob um pai que não existe,
- a remoção de um pai antes dos seus filhos,
- uma escrita ou um comando a uma vista que já não existe.

Um lote rejeitado lança uma exceção na chamada `__kuitoHostCommit` do kernel,
onde o diário do commit desfaz o lado do kernel. Os lotes aceites do trabalho
juntam-se à `MutationQueue` do trabalho; um trabalho que lança uma exceção mais
tarde descarta-os e a tabela recupera-os, pelo que a tabela e a plataforma nunca
veem metade de um trabalho.

A `MutationQueue` mantém os registos estruturais por ordem e apenas a última
escrita por prop dentro de cada intervalo delimitado (criações, remoções,
achatamentos, comandos e registos de UI delimitam; os movimentos não), na
posição dessa última escrita. Um diff de chaves edita o que veio antes dele,
pelo que nunca é descartado e nenhuma escrita da sua prop se funde através dele.

## As plataformas

- iOS: a bridge entrega ao Swift as mutações do trabalho como um array C de
  `KuitoMutationRecord` (`native/ios/Renderer/KuitoMutationRecord.h`), uma
  vista das `Mutation`s C++ lidas no sítio; `KuitoUIKitRenderer.apply(_:)`
  executa cada uma. O Swift não importa os próprios tipos C++: isso passaria
  todos os targets Swift para interoperabilidade com C++ por causa de uma
  struct.
- Android: uma chamada JNI por lote com arrays primitivos paralelos (op, tipo
  de valor, chave, id, pai, um int, um número, texto, nome e as edições de um
  diff de chaves), lidos por `KuitoMutations`; `KuitoAndroidRenderer.apply`
  executa cada registo.
- Os renderizadores indexam as suas vistas por número e mantêm um único mapa,
  id → o estilo da vista; o pai de uma vista está no seu estilo. Nem sempre é o
  pai do seu nó de layout: uma página, uma sheet ou uma linha de lista é uma
  raiz de layout própria, pelo que a árvore de layout por si só não pode ser a
  hierarquia. Os setters recebem um `KuitoValue` tipado e não analisam nenhum
  escalar; as props próprias da vista de um módulo nativo descodificam
  `untyped`, o valor como escalar (docs/native-modules.md#views).

## O frame

Os lotes atravessam para a thread de UI num único sítio,
`native/shared/FrameHandoff.h`, que ambos os runtimes partilham. A thread JS
empurra o lote de cada trabalho; o primeiro que um handoff inativo recebe pede
à plataforma um frame de visualização (um `CADisplayLink` no iOS, o
`Choreographer` no Android), o único callback de frame que qualquer das shells
tem.

Nesse frame, `UIRuntime::drain(now, budget)` aplica os lotes em espera por
ordem durante até ~4 ms, pelo menos um custe o que custar, cada um através do
renderizador da plataforma (cujos registos `ui` e `ui-script` voltam ao
runtime de UI, por ordem). Depois executa o frame do kernel de UI, a seguir aos
lotes, para que o motion veja as vistas que eles criaram. Pede outro frame
enquanto houver lotes em espera ou algo a animar. Um lote empurrado enquanto
drena espera pelo frame seguinte.

Um frame que termina com lotes que devia ter aplicado marca o handoff como
ocupado: a thread de UI está atrasada. O kernel lê-o através de
`__kuitoHostBusy()` e retém entretanto os seus replaneamentos estruturais,
já que os seus lotes apenas ficariam em fila atrás dos ainda não aplicados. As
escritas continuam a partir de imediato. O drain que recupera o atraso envia o
evento de aplicação `host.idle` (docs/events.md), e cada replaneamento que
esperou corre uma vez, para todas as escritas atrás dele.

## Eventos

Os eventos nativos atravessam no sentido inverso como `(handle, event, payload)`:
o número da vista (0 para a aplicação), o nome do evento e a sua carga JSON
(docs/events.md).

## Verificação

`test/native-batch.cpp` (executado por `npm test`) descodifica registos de todos
os tipos, rejeita os malformados e os valores do tipo errado, e verifica as
rejeições da tabela, o seu rollback de lote inteiro, a coalescência da fila e o
orçamento e a flag de ocupado do handoff de frame. `test/incremental.test.ts`
verifica que os replaneamentos esperam enquanto o host está ocupado e correm
uma vez em `host.idle`.
`test/native-batch.test.ts` verifica o lado do kernel: uma chamada ao host para
uma primeira renderização e para um evento, valores tipados, operações de UI
depois das vistas que referem, e um lote rejeitado desfeito no kernel.
