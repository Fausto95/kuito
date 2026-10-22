# Renderizador nativo

Como as operações de vista do kernel se tornam vistas UIKit e Android.

## Forma

- O TSX da app compila através do lowering de JSX do Oxc no Rolldown (runtime clássico `__kuitoJSX`).
- As propriedades nativas calculadas são expressões JSX que leem sinais (p. ex. `opacity={visible.value ? 1 : 0}`), que o compilador transforma em closures. O kernel acompanha os sinais lidos pela closure e subscreve-os, fazendo atualizações ao nível da propriedade **sem voltar a executar a função do componente**. As condições estruturais (`Show`, `Switch`/`Match`, expressões reativas de filhos) re-planeiam o módulo quando os seus sinais mudam; ver [controlo de fluxo](control-flow.md).
- O rótulo de uma vista corresponde a um único objeto nativo: a sua prop `id`, ou `__kuito:<module>:<path>` gerado a partir do seu lugar, componente e chave ([atualização incremental](incremental.md)). Dentro do kernel, cada rótulo tem um número (`src/runtime/view-ids.ts`) desde o plano que primeiro o nomeia até a vista ser removida; `plan.ts`, `reconcile.ts` e `commit.ts` trabalham com números, e `host.ts` volta a transformá-los em rótulos na fronteira com o host. Os patches compatíveis atualizam valores de propriedades e handlers mantendo o objeto e o sinal. As vistas removidas são descartadas. Uma vista cujo tipo ou pai muda é removida e criada de novo, com a sua subárvore. As movimentações mantêm a maior sequência de filhos que já está em ordem e movem os restantes.
- `native/ios/Renderer/` (UIKit) e `native/android/app/src/main/java/dev/kuito/runtime/renderer/` (Android Views) implementam as mesmas operações de vista com o mesmo layout:
  - `Kuito*Renderer` é dono apenas da árvore de vistas: criar, mover, remover (com `exiting`), limpar.
  - `KuitoViewFactory` mapeia cada tipo Kuito para uma vista nativa e liga os seus eventos. Os tipos que os módulos nativos contribuem (`module:<Name>`) vêm de `KuitoModuleViews` através da mesma pesquisa, e trazem a sua própria tabela de props, mantida no estilo da vista à frente das partilhadas ([vistas nativas](native-modules.md#views)).
  - `KuitoEventEmitter` escreve os eventos no formato de transmissão descrito em [eventos](events.md).
  - `properties/` contém uma tabela por preocupação (animação, layout, decoração, texto, controlos), indexada pelo nome da prop; `KuitoProperties` funde-as, rejeita uma prop reclamada duas vezes, e indexa os setters pela chave da prop (`KuitoProperties.byKey`), pelo que a chave de um registo encontra o seu setter sem fazer hash de um nome. As props próprias de uma vista de módulo vêm primeiro, por nome. Adicione uma prop a `src/protocol/manifest.ts` (a sua preocupação nomeia a tabela), corra `npm run generate`, e depois adicione uma entrada a essa tabela em ambas as plataformas; `test/protocol-parity.test.ts` falha até que cada plataforma que o manifesto marca tenha o setter, e falha num setter, tipo de vista ou chave de payload de evento que o manifesto não lista. Cada tabela é um único literal, para que o teste a possa ler.
  - `styling/` contém o registo por vista (`KuitoViewStyle`, abaixo), as especificações de animação, as cores e a análise de valores.
  - `KuitoCommands` mapeia cada comando para o que ele faz. Um comando é uma instrução única (`focus`, `blur`, `keyboard.dismiss`, `accessibility.announce`, `accessibility.focus`, `accessibility.status`): o kernel escreve um registo `Command` no lote do host, depois das mutações que o precedem (docs/native-scheduling.md). O id 0 dirige-se à app.
  - `keyboard/` acompanha o teclado e move as vistas que o evitam ([teclado](keyboard.md)); `accessibility/` compõe as props de acessibilidade de cada vista e reporta o estado ([acessibilidade](accessibility.md)).

## Um registo por vista

Cada renderizador mantém um único mapa, `nodes`, do número de uma vista para o
seu registo, `KuitoViewStyle`. O registo é tudo o que o renderizador sabe
sobre a vista:

- `view`: a sua vista nativa, nil enquanto o nó está achatado. O nó de layout
  aponta para a mesma vista; definir a do registo define a do nó.
- `content`: para onde vão as vistas dos seus filhos quando não é a própria
  vista (o conteúdo de um Scroll).
- `layoutRoot` (iOS) e `sheet`: definidos para uma vista que faz o layout da
  sua própria subárvore, fora do layout do pai.
- `exiting`: definido quando uma vista removida saiu da árvore do Kuito mas
  não do ecrã. `animated` enquanto a thread de UI corre o seu `exit`, cujas
  props ainda aceita até `exited`; `transition` enquanto a transição do seu
  contentor move uma página para fora do ecrã. Qualquer outra mutação dela é
  um `missingView`. O registo desaparece quando a vista desapareceu.
- O seu nó de layout, gestos, e o estado de estilo das props que se compõem
  num único valor de plataforma (transformação, atributos de texto, fundo).

O achatamento muda um único facto, o `view` do registo, e o registo mantém-se.
`clear()` descarta todos os registos.

## Erros

Todos os erros que um renderizador lança são um `KuitoRenderError`, com os
mesmos quatro casos em ambas as plataformas
(`native/ios/Renderer/KuitoRenderError.swift`,
`native/android/.../renderer/KuitoRenderError.kt`). A shell descarta a
mutação e reporta o erro ([LogBox](logbox.md)); nada recorre a um fallback.

| Caso               | Quando                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `unsupportedProp`  | A vista não aceita tal prop ou comando: nenhuma tabela a tem, ou pertence a outro tipo (`objectFit` num `Box`).                                                    |
| `unsupportedValue` | A prop ou o comando não aceita tal valor. Nomeia a prop, o valor, a vista e o que a prop aceita.                                                                   |
| `invalidTree`      | A mutação produz uma árvore que o renderizador não consegue mostrar: um número em uso, um tipo desconhecido, uma página fora do seu contentor, achatar duas vezes. |
| `missingView`      | Nenhuma vista tem o número.                                                                                                                                        |

Um setter lança `context.unsupportedProp()` ou
`context.unsupportedValue(value, reason)`. O código abaixo de um setter que
não tem contexto (uma especificação de gesto, as chaves de uma lista, o nome
de um símbolo) lança `KuitoRenderError.Rejection(reason)`, que o renderizador
transforma em `unsupportedValue` para a prop que está a ser definida; a
rejeição de um comando torna-se `unsupportedValue` para o comando.

## Exemplo

```tsx
import { Button, Text, VStack, signal } from 'kuito';

export default function Counter() {
  const count = signal(0);

  return (
    <VStack gap={16}>
      <Text>Count: {count.value}</Text>
      <Button onPress={() => count.value++}>Increment</Button>
    </VStack>
  );
}
```

O kernel planeia as três vistas uma só vez; um toque escreve `count`, e apenas
o `Text` é atualizado; nada é re-planeado.

## Validação local

Corra `npm test` para os testes de contrato puros em JS/VM, e os testes do renderizador num simulador e num emulador (o `CLAUDE.md` nomeia os comandos).
