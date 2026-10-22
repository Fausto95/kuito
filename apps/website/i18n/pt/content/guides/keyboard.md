# Teclado

O lado nativo acompanha o teclado virtual e mantém os campos de entrada fora do seu caminho por si só, dentro da animação do teclado. O JavaScript não está nesse caminho, pelo que nada espera por uma ida e volta e nada adivinha um deslocamento.

## Evitamento

As vistas de scroll e as listas fazem-no por predefinição. Enquanto o teclado cobre parte de um Scroll ou de uma List vertical, o seu conteúdo é recuado por essa parte, para que todo ele possa ainda deslizar para a vista, e um campo de entrada focado lá dentro sobe até ficar livre do teclado. Desligue-o com `keyboard={{ inset: false }}`.

Qualquer contentor pode evitá-lo com `keyboard={{ avoid }}`:

| Valor      | O que acontece                                                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `none`     | Nada (a predefinição).                                                                                                                          |
| `padding`  | O padding inferior cresce pela parte do contentor que o teclado cobre, e o seu conteúdo dispõe-se acima dele. Um compositor de chat.            |
| `position` | O contentor sobe até o seu campo de entrada focado ficar livre do teclado, ou, sem um campo de entrada focado lá dentro, até o seu fundo ficar. |

```tsx
<SafeArea flex={1}>
  <List data={messages} renderItem={renderMessage} />
  <HStack keyboard={{ avoid: 'padding' }}>
    <TextField flex={1} placeholder="Message" enterKeyHint="send" onSubmit={send} />
  </HStack>
</SafeArea>
```

`padding` soma-se ao recuo de uma SafeArea em vez de se empilhar sobre ele: o fundo recebe o que for maior, o indicador de início ou o teclado. Após qualquer alteração de layout enquanto o teclado está visível, o evitamento mede de novo.

## Campos de entrada

| Prop                         | Significado                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `enterKeyHint`               | A etiqueta da tecla enter: `enter`, `done`, `go`, `next`, `search` ou `send`.              |
| `submitBehavior`             | Após `onSubmit`: `blurAndSubmit` (predefinição) esconde o teclado; `submit` mantém o foco. |
| `autoFocus`                  | Foca o campo de entrada assim que estiver no ecrã.                                         |
| `ref.focus()` / `ref.blur()` | Focar ou desfocar a partir do JavaScript.                                                  |

A ordem de foco é a ordem em que os campos de entrada aparecem na árvore de vistas, saltando os campos escondidos e desativados. Com `enterKeyHint="next"` e o `submitBehavior` predefinido, a tecla enter move o foco para o campo seguinte nativamente, pelo que o teclado nunca desce e volta a subir. O último campo desfoca-se. Os campos `multiline` e `submitBehavior="newline"` ainda não existem.

Os campos controlados mantêm o que o utilizador escreve: o kernel nunca envia a um campo o texto que este acabou de reportar. Um valor que a aplicação define por si própria (limpar o campo, preencher uma sugestão) é enviado.

## Vistas de scroll

O objeto `keyboard` de um Scroll ou de uma List aceita também:

- `dismiss`: `none` (predefinição), `on-drag` (um arrasto esconde o teclado) ou `interactive` (iOS: o teclado segue o dedo; o Android esconde-o ao arrastar).
- `persistTaps`: com o teclado visível, um toque fora do campo focado: `never` (predefinição) esconde o teclado e não vai mais longe; `handled` esconde-o apenas quando nenhum pressable, botão, interruptor ou campo de entrada recebeu o toque; `always` deixa-o visível.
- `inset`: ver Evitamento. Verdadeiro por predefinição.

## keyboard

O teclado como sinais e eventos, para a lógica da aplicação. O layout não precisa dele.

```tsx
import { Text, keyboard } from 'kuito';

<Text>{keyboard.visible.value ? 'typing' : ''}</Text>;
keyboard.frame.value; // { screenX, screenY, width, height } or null

// In a component, until it unmounts; elsewhere, until remove().
keyboard.watch('didShow', (event) => console.log(event.frame.height, event.duration));

keyboard.dismiss();
```

`visible` passa a verdadeiro assim que o teclado apareceu e a falso assim que se escondeu; `frame` segue-o. `willShow`, `didShow`, `willHide`, `didHide`, `willChangeFrame` e `didChangeFrame` disparam em ambas as plataformas. Um evento é `{ frame, duration, easing, isEventFromThisApp }`: coordenadas em pontos no ecrã, duração em milissegundos, e `easing` é `keyboard` para a curva própria do sistema.

## Em profundidade

[Teclado](../../../../docs/keyboard.md) cobre como o evitamento mede contra o frame real do teclado, o que substitui a pesquisa de foco do Android, e como os comandos e os eventos de teclado atravessam a fronteira nativa.
