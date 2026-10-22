# Eventos

As props de evento têm o nome do facto que reportam ([nomenclatura](naming.md)).
Cada uma escuta um evento nativo, e algumas passam o valor que a vista reporta
em vez do evento.

| Prop                          | Evento nativo          | O handler recebe                              |
| ----------------------------- | ---------------------- | --------------------------------------------- |
| `onPress` / `onPressCapture`  | `press`                | `PressEvent` (propaga-se, cancelável)         |
| `onPressStart` / `onPressEnd` | `pressin` / `pressout` | o evento                                      |
| `onLongPress`                 | `longpress`            | o evento                                      |
| `onChange`                    | `change`               | o texto para TextField, `checked` para Toggle |
| `onSubmit`                    | `submit`               | `{ text }`                                    |
| `onFocus` / `onBlur`          | `focus` / `blur`       | o evento                                      |
| `onLoad` / `onError`          | `load` / `error`       | o evento                                      |
| `onScroll`                    | `scroll`               | o evento                                      |
| `onAction`                    | `accessibilityaction`  | `{ actionName }`                              |

Uma vista contribuída por um módulo nativo tem, em vez disso, os seus próprios
eventos: cada prop `on*` escuta o evento que nomeia (`onChangeEnd` para
`changeEnd`) quando a vista o declara, e o handler recebe o evento com os
campos do payload ([vistas nativas](native-modules.md#views)).

`onChange` passa o valor que a vista reporta, não o evento: o texto de um
TextField, o `checked` de um Toggle. O texto de um TextField é o seu `value`.

As vistas nativas reportam todos os eventos, quer a app os escute quer não; um
evento que ninguém escuta é descartado. Os eventos atravessam threads de forma
assíncrona, pelo que uma vista ainda pode reportar depois de um commit a ter
removido: um TextField focado perde o foco ao sair da janela, e tudo o que
enviou antes de a remoção chegar ao lado nativo ainda está a caminho. Esses
eventos também são descartados, pelo que os handlers de uma vista removida
nunca correm (não há `onBlur` ao desmontar, como no React Native). Um evento
dirigido a um id que o kernel nunca criou é um erro.

Um recarregamento limpa a árvore nativa antes de o runtime seguinte arrancar, e
nenhuma vista da árvore limpa volta a reportar: uma imagem ainda a carregar
quando a app recarrega nunca envia o seu `load` ao novo runtime, cujas vistas
reutilizam os mesmos ids.

O texto do `change` de um TextField e o valor do `change` de um Toggle tornam-se
a prop registada da vista, pelo que um `value` controlado que apenas repete o
que a vista reportou não lhe é reenviado (ver [teclado](keyboard.md#inputs)).

## Props bidirecionais

Algumas props são alteradas pela própria vista: o `value` de um TextField à
medida que o utilizador escreve, o `value` de um Toggle, o `open` de um Sheet
quando o utilizador o dispensa, o `refreshing` de uma scroll view ou de uma
lista quando o utilizador puxa para atualizar. O seu tipo é `Bound<T>`.
Entregue-lhe um sinal e a vista escreve-o, sem handler:

```tsx
const query = signal('');

<TextField value={query} />; // typing writes query; query.value = '' clears the field
```

O manifesto diz que evento reporta que prop (`reports` em
`src/protocol/manifest.ts`): o campo do payload com o novo valor
(`change` → `text`), ou o valor que o evento significa (`close` → `open: false`,
`refresh` → `refreshing: true`). O kernel regista-o primeiro como prop da
vista, pelo que a escrita do sinal não é reenviada: a vista já o mostra. Um
sinal só de leitura (um `computed`, o estado de plataforma de um módulo) ou um
valor simples é mostrado num só sentido e nunca escrito. Uma vista contribuída
por um módulo nativo reporta uma prop por qualquer evento cujo payload tenha
um campo com o nome da prop (o `value` de um Slider).

## Eventos ao nível da app

O estado que o lado nativo acompanha para a app inteira chega da mesma forma,
como um evento da app (handle 0) chamado `<target>.<event>`: `keyboard.<type>`
para o teclado, `accessibility.status` para o estado do leitor de ecrã e da
redução de movimento, `devtools.select` para o seletor de elementos do menu de
desenvolvimento, `ui` para uma mensagem da thread de UI, e `host.idle`, sem
payload, quando a thread de UI aplicou todos os lotes em que se tinha
atrasado, o que executa os re-planeamentos que esperavam por ela
([agendamento nativo](native-scheduling.md)). O kernel entrega-os aos sinais e
observadores `keyboard` e `accessibility` ([teclado](keyboard.md),
[acessibilidade](accessibility.md)); um que ninguém escuta é descartado.
Qualquer outro target é um erro.

## Formato de transmissão

Um evento nativo são três valores: o número da vista (aquele com que o lote do
host a criou, docs/native-scheduling.md; 0 para a app), o nome do evento, e um
payload em objeto JSON quando o evento transporta dados: `(17, "change",
'{"text":"Ada"}')`. A shell passa-os ao `dispatch` do runtime, que chama
`__kuito.dispatch(handle, event, payload)`. Um número que o JSON não consegue
representar (NaN, Infinity) é enviado como `null` no seu lugar em ambas as
plataformas; um valor que não é JSON de todo é um bug do renderizador e falha
ruidosamente. Os números de vista nunca são reutilizados, pelo que um evento de
uma vista que o kernel já removeu (um campo focado perde o foco ao sair da
janela) é descartado; um número que o kernel nunca atribuiu é um erro.
