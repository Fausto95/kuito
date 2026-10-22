# share

Das Teilen-Sheet des Systems: `UIActivityViewController` auf iOS, das Android
Sharesheet (`Intent.createChooser`) auf Android.

```tsx
import { share } from 'kuito';

const result = await share(
  { message: 'Severance', url: 'https://www.tvmaze.com/shows/44933', title: 'A show' },
  { dialogTitle: 'Share a show', subject: 'Watch this' },
);

if (result.action === 'shared') console.log('shared with', result.activityType);
```

`share(content, options?)` lehnt mit einem `TypeError` ab, wenn `content` weder
`message` noch `url` hat. Andernfalls löst es auf, sobald sich das Sheet schließt:

- `{ action: 'shared', activityType }`, wenn der Benutzer geteilt hat: `activityType`
  ist die Activity auf iOS (`com.apple.UIKit.activity.Mail`) und die gewählte
  Komponente auf Android (`com.google.android.gm/.ComposeActivityGmailExternal`).
- `{ action: 'dismissed' }`, wenn der Benutzer es geschlossen hat.

| Feld                            | iOS                                            | Android                   |
| ------------------------------- | ---------------------------------------------- | ------------------------- |
| `content.message`               | als Text geteilt                               | `EXTRA_TEXT`              |
| `content.url`                   | als URL geteilt                                | an `EXTRA_TEXT` angehängt |
| `content.title`                 | —                                              | `EXTRA_SUBJECT`           |
| `options.dialogTitle`           | —                                              | der Titel des Choosers    |
| `options.subject`               | der Betreff, den Activities wie Mail verwenden | —                         |
| `options.excludedActivityTypes` | auszulassende Activity-Typen                   | —                         |

Android meldet auch ein geschlossenes Sheet: das Sharesheet
benennt die vom Benutzer gewählte App über einen `IntentSender`, und wenn die Activity
ohne einen solchen fortgesetzt wird, bedeutet das, dass sich das Sheet geschlossen hat. Seine eigenen Aktionen, wie Kopieren und
Nearby Share, sind keine Apps und melden ebenfalls `dismissed`. Eine Tint-Farbe und ein
Anker werden nicht unterstützt; auf dem iPad ist das Sheet ein in der Bildschirmmitte
zentriertes Popover.
