# Arquitetura

O Kuito é seis partes: um compilador, um modelo de reatividade, um runtime no dispositivo, dois renderizadores com uma única forma, achatamento de vistas e o Live Patch. Os módulos nativos estendem tudo isto. Cada parte abaixo liga à página que aprofunda o tema.

<!-- diagram: kuito-architecture.svg -->

## Compilador

O TSX e o CSS tornam-se um bundle JavaScript e propriedades de estilo nativas em tempo de build.

- O **Oxc** reduz o TSX. Uma expressão JSX que lê um sinal (`opacity={visible.value ? 1 : 0}`) torna-se uma closure que o runtime subscreve.
- O **Rolldown** empacota a aplicação com as suas dependências npm, sem as modificar.
- **O compilador de estilos** transforma ficheiros `.css` e `styles()` em propriedades nativas numéricas, mais pequenas instruções relativas à fonte para `em`. CSS não suportado falha o build; nada analisa CSS no dispositivo.

Mais fundo: [Folhas de estilo](../../../docs/styles.md), [Unidades CSS](../../../docs/css-units.md), [Renderizador nativo](../../../docs/native-renderer.md).

## Reatividade

Um sinal guarda um valor. O JSX que o lê segue-o; uma escrita atualiza as propriedades nativas que o leem, e a função do componente não volta a executar.

<!-- diagram: kuito-reactivity.svg -->

- `computed` deriva, `watch` e `effect` reagem, `store` torna cada caminho de um objeto num sinal.
- As escritas agrupam-se sozinhas em lote: tudo o que um evento escreve chega ao ecrã em conjunto.
- `Show`, `Switch` e `For` são donos do seu ramo; uma mudança replaneia apenas esse ramo.
- Uma instância de componente é o seu lugar, a sua definição e a sua `key`. Cada hook conserva o seu slot pelo nome, não pela ordem de chamada, pelo que o estado sobrevive às edições.

Mais fundo: [Reatividade](../../../docs/reactivity.md), [Fluxo de controlo](../../../docs/control-flow.md), [Live Patch](../../../docs/incremental.md).

## Runtime

O JavaScript corre no Hermes dentro do processo nativo, numa thread só sua. As vistas vivem na thread de UI.

<!-- diagram: kuito-threads.svg -->

- Cada tarefa (um evento, um temporizador, a conclusão de um pedido de rede) envia no máximo um lote de mutações de vistas tipadas: `Create`, `Remove`, `Move`, `Flatten`, `Prop`, `Command`.
- O lote é um único `ArrayBuffer`, descodificado uma vez em C++. O Hermes chama C++ através de JSI; não há bridge serializada.
- A thread de UI aplica os lotes por ordem. Os eventos nativos voltam para o Hermes em fila, da mesma forma.
- As animações e os gestos podem correr na thread de UI, ao lado das vistas, sem um callback JavaScript por frame.

Mais fundo: [Threads e o lote do host](../../../docs/native-scheduling.md), [Hermes no dispositivo](../../../docs/on-device-hermes.md), [Movimento](../../../docs/motion.md).

## Renderizador

O UIKit no iOS e as Android Views no Android implementam as mesmas operações de vista com o mesmo layout.

<!-- diagram: kuito-renderer.svg -->

- O kernel numera as vistas e faz commit de um plano; uma label corresponde a um único objeto nativo, conservado entre patches compatíveis.
- Uma fábrica de vistas associa cada tipo a uma vista nativa. As tabelas de propriedades, uma por preocupação, são indexadas pelo nome da prop; um teste de paridade obriga ambas as plataformas a respeitar o manifesto.
- Cada renderizador guarda um registo por vista: a sua vista nativa, o seu nó de layout, os seus gestos, se está a sair.
- Uma prop chega a ambas as plataformas na mesma alteração, ou a documentação diz qual delas não a tem.

Mais fundo: [Renderizador nativo](../../../docs/native-renderer.md), [Eventos](../../../docs/events.md).

## Achatamento

Um contentor que apenas agrupa e posiciona os seus filhos não recebe vista nativa.

<!-- diagram: kuito-flattening.svg -->

- Apenas layout: `VStack`, `HStack`, `Box` ou `Spacer`, só props de layout, sem handler, sem ref, sem animação.
- O seu nó fica na árvore de layout; as vistas dos seus filhos juntam-se ao ancestral mais próximo com uma vista.
- Decide a chave da prop, não o seu valor: `backgroundColor={on.value ? 'red' : null}` conserva a sua vista enquanto a cor está desligada, pelo que alternar nunca cria nem destrói vistas.
- O kernel decide no commit; os renderizadores executam. Não há prop `collapsable`.

Mais fundo: [Achatamento de vistas](../../../docs/flattening.md).

## Live Patch

Um ficheiro guardado atualiza a aplicação em execução. O estado e as vistas nativas sobrevivem quando a edição é compatível.

<!-- diagram: kuito-live-patch.svg -->

- Os componentes transportam um id estável e uma impressão digital da sintaxe de que dependem. Uma edição volta a executar os componentes que leem o que mudou, e só esses; uma reformatação não volta a executar nenhum.
- Os patches são código-fonte JavaScript por um WebSocket local, aplicados pelo runtime Hermes persistente. As alterações ao código nativo precisam de um rebuild.
- Um patch que falha ao aplicar é rejeitado; a versão anterior continua em execução e o LogBox diz porquê.

Mais fundo: [Live Patch](../../../docs/incremental.md), [Devtools](../../../docs/devtools.md), [LogBox](../../../docs/logbox.md).

## Módulos nativos

Código de plataforma que uma aplicação chama: uma classe Swift, uma classe Kotlin e uma única especificação TypeScript que declara ambas.

<!-- diagram: kuito-native-modules.svg -->

- O compilador lê a especificação sem a executar e conserva um stub por função que a aplicação chama; o bundle transporta apenas esses.
- Os módulos são ligados por id às shells que a CLI gera. A aplicação não faz commit de nenhum projeto nativo.
- Um módulo pode expor funções, sinais que a plataforma atualiza e vistas renderizadas em JSX, como fazem `Camera`, `Video` e `WebView`.
- As capacidades do próprio Kuito (`haptics`, `location`, `storage`, …) são módulos deste tipo.

Mais fundo: [Módulos nativos](../../../docs/native-modules.md), [Projetos de aplicação](../../../docs/apps.md).

## Decisões

As regras que todas as partes respeitam, e o que ainda está em aberto, estão no [registo de decisões](../../../docs/architecture.md).
