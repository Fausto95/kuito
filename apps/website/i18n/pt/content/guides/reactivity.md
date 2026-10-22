# Reatividade

Os sinais guardam os valores que mudam. O JSX que lê um sinal segue-o, sem voltar a executar o componente.

## Sinais

```tsx
import { Pressable, Text, computed, signal, watch } from 'kuito';

function Counter() {
  const count = signal(0);
  const doubled = computed(() => count.value * 2);
  watch(count, (next, previous) => console.log(previous, '->', next));
  return (
    <Pressable onPress={() => count.value++}>
      <Text opacity={count.value > 0 ? 1 : 0.5}>{doubled}</Text>
    </Pressable>
  );
}
```

- `signal(initial)` criado enquanto um componente se configura pertence ao slot desse componente; criado em qualquer outro sítio, é um sinal por si só.
- `computed(fn)` é um sinal só de leitura com o que `fn` devolve, calculado na primeira leitura e de novo apenas quando um sinal que leu mudou.
- `watch(source, fn)` executa `fn(next, previous)` quando o sinal, ou o que a função `source` lê, muda. Num componente termina quando o componente é desmontado; noutro sítio corre daí em diante. Devolve uma subscrição cujo `remove()` o pára.
- `effect(fn)` volta a executar `fn` sempre que o que leu muda.

## Lotes

As escritas agrupam-se por si. Tudo o que um evento nativo escreve chega ao ecrã em conjunto, num único lote do host. Uma escrita em qualquer outro sítio (depois de um `await`, num temporizador) abre um lote que termina na microtarefa seguinte. Uma leitura é sempre atual: um `computed` lido logo a seguir a uma escrita vê-a.

## Sinais em props

Uma prop aceita um valor ou um sinal (`Prop<T>`): `opacity={level}` segue `level`, tal como `opacity={level.value}`, pois o compilador torna reativa cada expressão JSX. Uma função numa prop é sempre um handler, pelo que um thunk escrito à mão (`opacity={() => level.value}`) é um erro de tipo: escreva a expressão, ou derive um sinal com `computed(() => ...)`. Os filhos e o `when` de `Show` aceitam sinais da mesma forma.

Uma leitura de `.value` no corpo de um componente, fora do JSX e fora de qualquer função, vê apenas o primeiro valor, porque o componente se configura uma única vez. O compilador avisa disso com o ficheiro e a linha.

## Stores

`store(initial)` cria um objeto ou um array em que cada caminho é um sinal:

```tsx
import { Pressable, Text, store } from 'kuito';

const shelf = store({ books: [{ id: 1, title: 'Dune', liked: false }] });

function Book() {
  return (
    <Pressable onPress={() => (shelf.books[0].liked = true)}>
      <Text>{shelf.books[0].liked ? '♥' : '♡'}</Text>
    </Pressable>
  );
}
```

- Uma leitura através do store segue só esse caminho: a label acima segue `books[0].liked`, e uma escrita em `books[0].title` deixa-a em paz.
- Os métodos de array (`push`, `splice`, `sort`) escrevem através dele também.
- Envolve `initial` em vez de o copiar, pelo que os dados ficam simples. Escreva através do store: uma alteração feita diretamente no objeto simples não chega a ninguém.
- Os objetos e arrays simples dentro dele são stores também; instâncias de classes, datas e maps são valores.

## Props de componentes

Um componente lê as suas props como valores, como no React: `props.show.name`. Onde uma prop é lida decide o que é atualizado:

- Lida dentro do JSX (`<Text>{props.count}</Text>`), mantém-se reativa: o texto segue o sinal por trás da prop.
- Lida no corpo do componente ou desestruturada (`function Label({ count })`), é lida uma vez, quando o componente renderiza.

Leia as props onde são usadas quando devem seguir um sinal.

## Identidade dos hooks

O estado de um hook pertence ao seu slot, identificado por `<component path>:<kind>:<name>`, nunca pela sua posição entre as chamadas. Um hook atribuído a uma variável tem o nome dela (`const visits = signal(1)`); um atribuído a nada é nomeado pelo seu ordinal entre os hooks do seu tipo.

Assim, adicionar um hook, reordenar hooks ou chamar um dentro de um `if` mantém o estado de todos os outros hooks através dos Live Patches. Mudar o nome de uma variável muda o nome do seu slot, que recomeça. O estado de um slot dura tanto quanto a instância do seu componente.

## Em profundidade

[Reatividade](../../../../docs/reactivity.md) cobre como um patch de código fonte mantém os valores das expressões, as regras completas de nomeação dos hooks e o que constitui uma instância de componente.
