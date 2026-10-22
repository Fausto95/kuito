# Teclado

O lado nativo acompanha o teclado virtual e mantém os campos de entrada fora do
seu caminho por si só, dentro da animação do teclado: as notificações de teclado
do UIKit no iOS, `WindowInsetsAnimation` no Android, onde o evitamento segue o
teclado frame a frame. O JavaScript não está nesse caminho, pelo que nada espera
por uma ida e volta e nada adivinha um deslocamento, como o
`KeyboardAvoidingView` do React Native faz com `keyboardVerticalOffset`.

## Evitamento

**As vistas de scroll e as listas fazem-no por predefinição.** Enquanto o
teclado cobre parte de um Scroll ou de uma List vertical, o seu conteúdo é
recuado por essa parte, para que todo ele possa ainda deslizar para a vista, e
um campo de entrada focado lá dentro (numa linha, no caso de uma lista) sobe
até ficar livre do teclado. O recuo soma-se ao padding da própria vista. Uma
lista invertida recebe-o no seu início, que no ecrã fica em baixo, pelo que uma
lista que ali repousa mantém as suas primeiras linhas acima do teclado, como um
chat deve. Desligue-o com `keyboard={{ inset: false }}`.
Está ligado por predefinição, em ambas as plataformas.

**Qualquer contentor pode evitá-lo** com `keyboard={{ avoid }}`:

| Valor      | O que acontece                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `none`     | Nada (a predefinição).                                                                                                                          |
| `padding`  | O padding inferior cresce pela parte do contentor que o teclado cobre, e o seu conteúdo dispõe-se acima dele. Um compositor de chat.            |
| `position` | O contentor sobe até o seu campo de entrada focado ficar livre do teclado, ou, sem um campo de entrada focado lá dentro, até o seu fundo ficar. |

```tsx
<SafeArea flex={1}>
  <List data={messages} renderItem={...} />
  <HStack keyboard={{ avoid: 'padding' }}>
    <TextField flex={1} placeholder="Message" enterKeyHint="send" onSubmit={send} />
  </HStack>
</SafeArea>
```

Ambos medem o contentor contra o frame real do teclado, onde quer que o
contentor esteja no ecrã e como quer que os seus ancestrais o escalem, rodem ou
invertam. `padding` soma-se ao recuo de uma SafeArea em vez de se empilhar sobre
ele: o fundo recebe o que for maior, o indicador de início ou o teclado.
`position` compõe-se com o `translateY` da própria vista. Após qualquer
alteração de layout enquanto o teclado está visível (um irmão redimensiona-se,
chega conteúdo), o evitamento mede de novo.

## Campos de entrada

| Prop                         | Significado                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `enterKeyHint`               | O `enterkeyhint` do HTML, a etiqueta da tecla enter: `enter`, `done`, `go`, `next`, `search` ou `send`. |
| `submitBehavior`             | Após `onSubmit`: `blurAndSubmit` (predefinição) esconde o teclado; `submit` mantém o foco.              |
| `autoFocus`                  | Foca o campo de entrada assim que estiver no ecrã.                                                      |
| `ref.focus()` / `ref.blur()` | Focar ou desfocar a partir do JavaScript.                                                               |

**A ordem de foco** é a ordem em que os campos de entrada aparecem na árvore de
vistas, como no DOM: dentro do mesmo ecrã ou sheet, saltando os campos
escondidos e desativados. Com `enterKeyHint="next"` e o `submitBehavior`
predefinido, a tecla enter move o foco para o campo seguinte nativamente, no
mesmo frame, pelo que o teclado nunca desce e volta a subir. O último campo
desfoca-se. Mover o foco por si próprio em `onSubmit` continua a funcionar: o
seu `focus()` chega depois do movimento nativo e prevalece. No Android isto
substitui a pesquisa espacial de foco da plataforma, pelo que ambas as
plataformas percorrem os mesmos campos. Uma tecla Enter física move uma vez.

Os campos `multiline` e `submitBehavior="newline"` ainda não existem.

**Os campos controlados mantêm o que o utilizador escreve.** Um evento de
alteração pode chegar ao JavaScript depois de o utilizador ter escrito mais.
Devolver o seu texto como `value` apagaria os caracteres mais recentes, pelo que
o kernel nunca envia a um campo o texto que este acabou de reportar. Um valor que
a aplicação define por si própria (limpar o campo, preencher uma sugestão) é
enviado. O mesmo vale para o `value` de um Toggle.

## Vistas de scroll

O objeto `keyboard` de um Scroll ou de uma List aceita também:

| Campo         | Significado                                                                                                                                                                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dismiss`     | `none` (predefinição), `on-drag` (um arrasto esconde o teclado) ou `interactive` (iOS: o teclado segue o dedo; o Android não tem tal teclado e esconde-o ao arrastar).                                                                                     |
| `persistTaps` | Com o teclado visível, um toque fora do campo focado: `never` (predefinição) esconde o teclado e não vai mais longe; `handled` esconde-o apenas quando nenhum pressable, botão, interruptor ou campo de entrada recebeu o toque; `always` deixa-o visível. |
| `inset`       | Ver [Evitamento](#avoidance). Verdadeiro por predefinição.                                                                                                                                                                                                 |

Com `never` a vista de scroll continua a deslizar: só um toque é retido dos
seus filhos. Ambas as plataformas decidem se um toque foi tratado da mesma
forma, a partir da vista sob o dedo.

## keyboard

O teclado como sinais e eventos, para a lógica da aplicação. O layout não
precisa dele.

```tsx
import { Text, keyboard } from 'kuito';

<Text>{keyboard.visible.value ? 'typing' : ''}</Text>;
keyboard.frame.value; // { screenX, screenY, width, height } or null

// In a component, until it unmounts; elsewhere, until remove().
keyboard.watch('didShow', (event) => console.log(event.frame.height, event.duration));

keyboard.dismiss();
```

`visible` passa a verdadeiro assim que o teclado apareceu e a falso assim que
se escondeu; `frame` segue-o, e cada alteração é um novo objeto de frame.
`willShow`, `didShow`, `willHide`, `didHide`, `willChangeFrame` e
`didChangeFrame` disparam em **ambas** as plataformas; no Android vêm do início
e do fim da animação do inset. Um evento é
`{ frame, duration, easing, isEventFromThisApp }`: coordenadas em pontos no
ecrã (altura 0 depois de escondido), duração em milissegundos (0 quando o
teclado não anima), e `easing` é `keyboard` para a curva própria do sistema.

## Como atravessa a fronteira

- `keyboard.dismiss()`, `focus()` e `blur()` são **comandos**: instruções
  únicas na fila de mutações, depois das mutações de vistas anteriores a elas.
  Um `focus()` logo a seguir à alteração de estado que mostra um campo de
  entrada chega ao campo assim que este existe. Ver
  [renderização nativa](native-renderer.md).
- Os eventos de teclado são eventos nativos da aplicação (handle 0) chamados
  `keyboard.<type>` (`keyboard.didshow` mais uma carga plana), despachados como
  os de uma vista (ver [eventos](events.md)). Um evento que ninguém escuta é
  descartado.
