# Reatividade

## Sinais

Um sinal guarda um valor que muda. O JSX que o lê segue-o, sem
voltar a executar o componente:

```tsx
import { Pressable, Text, computed, signal, watch } from 'kuito';

const theme = signal<'light' | 'dark'>('light'); // shared by every component

function Counter() {
  const count = signal(0); // this component's own, kept across Live Patches
  const doubled = computed(() => count.value * 2);

  watch(count, (next, previous) => console.log(previous, '→', next));

  return (
    <Pressable
      onPress={() => {
        count.value++;
        theme.value = 'dark'; // one update with the count, no batch() needed
      }}
    >
      <Text opacity={count.value > 0 ? 1 : 0.5}>{doubled}</Text>
    </Pressable>
  );
}
```

- `signal(initial)` criado enquanto um componente se configura pertence ao
  slot desse componente (abaixo); criado em qualquer outro sítio, é um sinal
  por si só.
- `computed(fn)` é um sinal só de leitura com o que `fn` devolve, calculado na
  primeira leitura e de novo apenas quando um sinal que leu mudou.
- `watch(source, fn)` executa `fn(next, previous)` quando o sinal, ou o que a
  função `source` lê, muda. Num componente termina quando o componente é
  desmontado; noutro sítio corre daí em diante. Em qualquer dos casos devolve
  uma subscrição cujo `remove()` o pára.
- `effect(fn)` volta a executar `fn` sempre que o que leu muda.

As escritas agrupam-se por si. Tudo o que um evento nativo escreve chega ao
ecrã em conjunto, num único lote do host. Uma escrita em qualquer outro sítio
(depois de um `await`, num temporizador) abre um lote que termina na
microtarefa seguinte, pelo que as escritas até lá vão também em conjunto. Uma
leitura é sempre atual: um `computed` lido logo a seguir a uma escrita vê-a. O
que corre mais tarde é apenas o que escuta: bindings, `watch` e `effect`.

Uma prop aceita um valor ou um sinal (`Prop<T>`): `opacity={level}` segue
`level`, tal como `opacity={level.value}`, pois o compilador torna reativa
cada expressão JSX. Uma função numa prop é sempre um handler, pelo que um
thunk escrito à mão (`opacity={() => level.value}`) é um erro de tipo: escreva
a expressão, ou derive um sinal com `computed(() => …)`. Os filhos e o `when`
de `Show` aceitam sinais da mesma forma.

Uma leitura de `.value` no corpo de um componente, fora do JSX e fora de
qualquer função, vê apenas o primeiro valor, porque o componente se configura
uma única vez. O compilador avisa disso com o ficheiro e a linha, e a CLI
mostra o aviso.

## Stores

`store(initial)` cria um objeto ou um array em que cada caminho é um sinal,
à imagem das stores mutáveis do Solid:

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

- Uma leitura através da store segue apenas esse caminho: a etiqueta acima
  segue `books[0].liked`, e uma escrita em `books[0].title` não lhe toca.
- Uma escrita através da store notifica os bindings que leram o que mudou,
  agrupada como qualquer escrita num sinal. Os métodos de array (`push`,
  `splice`, `sort`) também escrevem através dela: uma expressão que leu
  `books.length` ou mapeou o array segue-os, e `Object.keys` e `in` seguem as
  chaves que vão e vêm.
- Envolve `initial` em vez de o copiar, e cada objeto tem um único proxy:
  `shelf.books[0] === shelf.books[0]`. Um objeto de store atribuído a outro
  caminho é guardado como o seu objeto simples, pelo que os dados continuam
  simples (passa por `JSON.stringify` tal como está). Escreva através da
  store: uma alteração feita diretamente ao objeto simples não chega a
  ninguém.
- Os objetos e arrays simples dentro dela são também stores; as instâncias de
  classes, as datas e os maps são valores.
- Criada enquanto um componente se configura, pertence ao slot desse
  componente e dura através dos Live Patches, tal como `signal()` (o
  compilador dá-lhe nome).

## Atualização granular e identidade das expressões

O Kuito distingue **atualizações de sinais** de **patches de código-fonte**.

- As atualizações de sinais modificam as propriedades nativas dependentes sem
  voltar a executar os componentes.
- Um patch de código-fonte reconstrói atualmente a árvore de descritores de
  componentes para descobrir as edições estruturais. Isso ainda não é granular
  ao nível do componente.
- Durante um patch de código-fonte, os valores das expressões JSX etiquetadas
  pelo compilador são mantidos quando o hash da expressão, o texto estático
  envolvente e o ID estável da vista coincidem. O valor nativo antigo é
  reutilizado; uma nova closure recebe as alterações de sinais seguintes.
- As expressões cujo código-fonte muda são avaliadas de novo. Isto evita
  especificamente que <Text>Hey{Math.random()}</Text> mude só porque a
  etiqueta de um Button separado foi editada.
- Uma nova renderização (um sinal estrutural replaneia o módulo) avalia de novo
  as expressões de um componente que voltou a correr: o mesmo código-fonte
  corre com outras props. Um componente que não voltou a correr devolve a sua
  árvore anterior, e uma prop ou uma etiqueta cujo thunk é o mesmo objeto
  mantém o seu valor e os sinais que leu, sem ser avaliada, em cada plano. As
  subscrições duram através dos planos: um binding mantido conserva-as, e um
  binding avaliado de novo subscreve apenas os sinais que passou a ler e
  larga os que deixou de ler. Uma prop de objeto reconstruída com dados
  iguais (um estilo, os gestos) não é enviada de novo: o kernel guarda o JSON
  com que as props de objeto de cada vista foram enviadas pela última vez.

Isto é uma **mitigação dirigida, não uma invalidação granular pura do
código-fonte**: as funções dos componentes continuam a executar-se enquanto um
patch é preparado, e o código no corpo dos componentes pode ter efeitos
secundários. Alterações a valores não reativos capturados por closures, a
entradas de componentes pais, a closures lexicais e a dependências que mudam
dinamicamente podem não ser refletidas se o texto da expressão não mudou.
Trabalho futuro: grafos de dependências de componentes gerados pelo compilador,
invalidação completa de props por instância, novo rastreio reativo de
dependências dinâmicas e reconstrução segura de subárvores. Evite depender de
expressões de renderização impuras para a correção da aplicação.

## Identidade dos hooks

O estado de um hook pertence ao seu slot, e a chave de um slot é
`<component path>:<kind>:<name>`, nunca a sua posição entre as chamadas. O
compilador passa a cada hook o seu nome como último argumento:

- um hook atribuído a uma variável recebe o nome dela: `const visits = signal(1)`
  torna-se `signal(1, "visits")`, e `store`, `motion`, `ref`, `task` e `resource`
  do mesmo modo;
- um hook atribuído a nada (`onMount`, `onCleanup`, `effect`, `watch`, ou um
  `signal(0)` solto) recebe como nome o seu ordinal entre os hooks do seu tipo
  na sua função, por ordem no código-fonte: `effect(fn, "#2")`;
- um nome reclamado duas vezes numa mesma renderização (um auxiliar que chama
  `signal()` duas vezes para a mesma variável) recebe `name#2`, `name#3`, por
  ordem de chamada. O código que o compilador não viu recebe nome por ordem de
  chamada da mesma forma.

`task` e `resource` partilham um tipo, pelo que os seus nomes têm de diferir
entre si; todos os outros tipos têm os seus próprios nomes.

Assim, acrescentar um hook, reordenar hooks ou chamar um dentro de um `if`
preserva o estado de todos os outros hooks: o Live Patch mantém os slots cujas
chaves sobrevivem, inicia os novos a partir dos seus valores iniciais e descarta
os removidos (um `effect` ou `onMount` removido executa a sua limpeza, um valor
`motion` removido é libertado em ambas as threads), e um aviso no dispositivo
nomeia os hooks que apareceram e desapareceram. Um hook dentro de um `if`
ocupa o seu slot apenas enquanto o ramo corre: quando a condição passa a falsa
o seu estado é libertado, e recomeça quando a condição volta a ser verdadeira.
Renomear uma variável renomeia o seu slot, que recomeça.

O estado de um slot dura tanto quanto a instância do seu componente: uma
instância que sai da árvore liberta todos os slots que tinha, e uma instância
que regressa parte dos valores iniciais. Uma instância é o seu lugar, o seu
componente e a sua `key` (`incremental.md`): renderizar outro componente ou
outra key no mesmo lugar é uma instância nova, mesmo dentro de uma expressão
como `{flag ? <A /> : <B />}`.

## Props de componentes

Um componente lê as suas props como valores, tal como no React: `props.show.name`.
Por trás de cada prop o compilador passa a expressão do atributo, e o kernel
expõe-a como um getter, como faz o Solid. Assim, o sítio onde uma prop é lida
decide o que é atualizado:

- Lida dentro do JSX (`<Text>{props.count}</Text>`), mantém-se reativa: o texto
  segue o sinal por trás da prop.
- Lida no corpo do componente ou desestruturada
  (`function Label({ count })`), é lida uma vez, quando o componente renderiza.

Leia as props onde são usadas quando devem seguir um sinal.
