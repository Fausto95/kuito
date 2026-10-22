# alert e prompt

Alertas nativos como promessas: `UIAlertController` no iOS, um diálogo Material no
Android. `prompt()` pede texto em ambas as plataformas.

```tsx
import { alert, prompt } from 'kuito';

const remove = { text: 'Delete', style: 'destructive' } as const;
const picked = await alert({
  title: 'Delete episode?',
  message: 'It leaves your downloads.',
  buttons: [{ text: 'Cancel', style: 'cancel' }, remove],
});

if (picked === remove) await removeEpisode(episode);

const answer = await prompt({ title: 'Rename list' });

if (answer?.button.text === 'OK') rename(list, answer.value);
```

## `alert(options)`

Mostra o alerta e resolve com o botão que o utilizador escolheu, o mesmo
objeto que `buttons` contém, ou `null` quando o alerta foi fechado sem escolher nenhum.
Sem `buttons`, um único botão OK.

| Campo do botão | Faz                                                                     |
| -------------- | ----------------------------------------------------------------------- |
| `text`         | A etiqueta.                                                             |
| `style`        | `default`, `cancel` ou `destructive` (vermelho). No máximo um `cancel`. |
| `preferred`    | iOS: o botão que a tecla Return escolhe, a negrito.                     |

| Opção                | Faz                                                                          |
| -------------------- | ---------------------------------------------------------------------------- |
| `title`, `message`   | O texto do alerta.                                                           |
| `buttons`            | Os botões, por ordem.                                                        |
| `cancelable`         | Android: Retroceder ou um toque fora fecha o alerta. Falso por predefinição. |
| `userInterfaceStyle` | iOS: `light` ou `dark` independentemente da aparência da aplicação.          |

Dois botões `cancel` rejeitam com um `TypeError` antes de algo aparecer: o UIKit lança uma exceção com
eles. O Android posiciona os botões como o React Native faz: o último é positivo, o
anterior negativo, um terceiro neutro, e mais de três falham com
`ERR_ARGUMENT`. Um botão `destructive` é desenhado na cor de erro do tema.

## `prompt(options)`

Um alerta com campos de texto. Aceita as opções de `alert`, com Cancelar e OK como
botões predefinidos, e resolve `{ button, value }`: o botão escolhido e
o que o utilizador escreveu, ou `null` quando fechado.

| `type`           | Campos                                                   | `value`               |
| ---------------- | -------------------------------------------------------- | --------------------- |
| `plain-text`     | um (a predefinição)                                      | o texto               |
| `secure-text`    | um, oculto                                               | o texto               |
| `login-password` | um login, com `defaultValue`, e uma palavra-passe oculta | `{ login, password }` |

`keyboardType` é `default`, `email-address`, `numeric`, `phone-pad`,
`number-pad`, `decimal-pad` ou `url`. No Android os campos são campos de texto Material
no diálogo, o teclado abre com ele, e Concluído no último campo
prime o último botão, que o teclado pode tapar num ecrã baixo.

Um reload fecha os alertas ainda abertos; as suas promessas nunca se resolvem.
