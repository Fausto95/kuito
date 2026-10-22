# share

The system share sheet: `UIActivityViewController` on iOS, the Android
Sharesheet (`Intent.createChooser`) on Android.

```tsx
import { share } from 'kuito';

const result = await share(
  { message: 'Severance', url: 'https://www.tvmaze.com/shows/44933', title: 'A show' },
  { dialogTitle: 'Share a show', subject: 'Watch this' },
);

if (result.action === 'shared') console.log('shared with', result.activityType);
```

`share(content, options?)` rejects with a `TypeError` when `content` has
neither `message` nor `url`. Otherwise it resolves once the sheet closes:

- `{ action: 'shared', activityType }` when the user shared: `activityType`
  is the activity on iOS (`com.apple.UIKit.activity.Mail`), and the chosen
  component on Android (`com.google.android.gm/.ComposeActivityGmailExternal`).
- `{ action: 'dismissed' }` when the user closed it.

| Field                           | iOS                                  | Android                  |
| ------------------------------- | ------------------------------------ | ------------------------ |
| `content.message`               | shared as text                       | `EXTRA_TEXT`             |
| `content.url`                   | shared as a URL                      | appended to `EXTRA_TEXT` |
| `content.title`                 | —                                    | `EXTRA_SUBJECT`          |
| `options.dialogTitle`           | —                                    | the chooser's title      |
| `options.subject`               | the subject activities like Mail use | —                        |
| `options.excludedActivityTypes` | activity types to leave out          | —                        |

Android reports a dismissed sheet too: the Sharesheet
names the app the user picks through an `IntentSender`, and the activity
resuming without one means the sheet closed. Its own actions, like Copy and
Nearby Share, are not apps and also report `dismissed`. A tint color and an
anchor are not supported; on iPad the sheet is a popover centered on the
screen.
