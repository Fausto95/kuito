# share

A folha de partilha do sistema: `UIActivityViewController` no iOS, a Sharesheet do
Android (`Intent.createChooser`) no Android.

```tsx
import { share } from 'kuito';

const result = await share(
  { message: 'Severance', url: 'https://www.tvmaze.com/shows/44933', title: 'A show' },
  { dialogTitle: 'Share a show', subject: 'Watch this' },
);

if (result.action === 'shared') console.log('shared with', result.activityType);
```

`share(content, options?)` rejeita com um `TypeError` quando `content` não tem
nem `message` nem `url`. Caso contrário, resolve assim que a folha fecha:

- `{ action: 'shared', activityType }` quando o utilizador partilhou: `activityType`
  é a atividade no iOS (`com.apple.UIKit.activity.Mail`), e o componente
  escolhido no Android (`com.google.android.gm/.ComposeActivityGmailExternal`).
- `{ action: 'dismissed' }` quando o utilizador a fechou.

| Campo                           | iOS                                       | Android                     |
| ------------------------------- | ----------------------------------------- | --------------------------- |
| `content.message`               | partilhado como texto                     | `EXTRA_TEXT`                |
| `content.url`                   | partilhado como URL                       | acrescentado a `EXTRA_TEXT` |
| `content.title`                 | —                                         | `EXTRA_SUBJECT`             |
| `options.dialogTitle`           | —                                         | o título do seletor         |
| `options.subject`               | o assunto que atividades como o Mail usam | —                           |
| `options.excludedActivityTypes` | tipos de atividade a excluir              | —                           |

O Android também reporta uma folha fechada: a Sharesheet
nomeia a aplicação que o utilizador escolhe através de um `IntentSender`, e a atividade
a retomar sem um significa que a folha fechou. As suas próprias ações, como Copiar e
Nearby Share, não são aplicações e também reportam `dismissed`. Uma cor de tonalidade e uma
âncora não são suportadas; no iPad a folha é um popover centrado no
ecrã.
