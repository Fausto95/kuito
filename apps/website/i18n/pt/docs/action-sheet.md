# actionSheet

Uma lista de ações, como promessa, em ambas as plataformas:
a folha de ações do `UIAlertController` no iOS, uma folha inferior Material no
Android.

```tsx
import { Pressable, actionSheet } from 'kuito';

<Pressable
  onPress={async (event) => {
    const index = await actionSheet({
      options: ['Share', 'Add to list', 'Delete', 'Cancel'],
      cancelButtonIndex: 3,
      destructiveButtonIndex: 2,
      title: 'Episode 4',
      anchor: { x: event.pageX ?? 0, y: event.pageY ?? 0 },
    });

    if (index === 2) remove(episode);
  }}
/>;
```

`actionSheet(options)` resolve o índice da opção escolhida. Fechar
a folha, com um toque fora, Retroceder ou um deslize, resolve `cancelButtonIndex`, ou
`null` sem um.

| Opção                    | Faz                                                                               |
| ------------------------ | --------------------------------------------------------------------------------- |
| `options`                | As etiquetas, pelo menos uma.                                                     |
| `cancelButtonIndex`      | Mostrado à parte: no fundo no iPhone e no Android, oculto num popover de iPad.    |
| `destructiveButtonIndex` | Um índice ou vários; desenhados a vermelho.                                       |
| `disabledButtonIndices`  | Mostrados esbatidos; não podem ser escolhidos.                                    |
| `title`, `message`       | Acima das opções.                                                                 |
| `tintColor`              | A cor das opções: uma cor hexadecimal. O design do iOS 26 ignora-a.               |
| `anchor`                 | `{ x, y }` em pontos da janela, como o `pageX` e o `pageY` de um evento de toque. |
| `userInterfaceStyle`     | iOS: `light` ou `dark` independentemente da aparência da aplicação.               |

Um índice fora de `options` rejeita com um `RangeError` antes de algo aparecer.

## iPad e a âncora

O iPad mostra a folha como um popover. Com um `anchor` aponta para lá; sem
um fica no meio da janela sem seta. Desde o iOS 26 uma âncora
cria um popover também no iPhone; sem uma, o iPhone mantém a folha no
fundo. Um popover fecha com um toque fora, o que resolve o índice de cancelamento,
ou `null` quando não há nenhum. A âncora é uma localização, não uma vista: não precisa
de procurar nenhuma vista e aponta para onde o utilizador tocou.

O Android lista as opções por ordem, com a opção de cancelamento em último lugar abaixo de um
separador, e resolve `null` quando a folha é fechada sem uma. Um
reload fecha as folhas ainda abertas.
