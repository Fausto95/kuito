# share

La feuille de partage du système : `UIActivityViewController` sur iOS, la Sharesheet
Android (`Intent.createChooser`) sur Android.

```tsx
import { share } from 'kuito';

const result = await share(
  { message: 'Severance', url: 'https://www.tvmaze.com/shows/44933', title: 'A show' },
  { dialogTitle: 'Share a show', subject: 'Watch this' },
);

if (result.action === 'shared') console.log('shared with', result.activityType);
```

`share(content, options?)` rejette avec une `TypeError` quand `content` n'a
ni `message` ni `url`. Sinon elle se résout une fois la feuille fermée :

- `{ action: 'shared', activityType }` quand l'utilisateur a partagé : `activityType`
  est l'activité sur iOS (`com.apple.UIKit.activity.Mail`), et le composant
  choisi sur Android (`com.google.android.gm/.ComposeActivityGmailExternal`).
- `{ action: 'dismissed' }` quand l'utilisateur l'a fermée.

| Champ                           | iOS                                            | Android                |
| ------------------------------- | ---------------------------------------------- | ---------------------- |
| `content.message`               | partagé comme texte                            | `EXTRA_TEXT`           |
| `content.url`                   | partagée comme URL                             | ajoutée à `EXTRA_TEXT` |
| `content.title`                 | —                                              | `EXTRA_SUBJECT`        |
| `options.dialogTitle`           | —                                              | le titre du sélecteur  |
| `options.subject`               | le sujet qu'utilisent les activités comme Mail | —                      |
| `options.excludedActivityTypes` | les types d'activité à exclure                 | —                      |

Android signale aussi une feuille fermée : la Sharesheet
nomme l'application choisie par l'utilisateur via un `IntentSender`, et la reprise
de l'activité sans cela signifie que la feuille s'est fermée. Ses propres actions, comme Copier et
Partage à proximité, ne sont pas des applications et signalent aussi `dismissed`. Une couleur de teinte et une
ancre ne sont pas prises en charge ; sur iPad la feuille est un popover centré sur
l'écran.
