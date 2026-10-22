# Share content with another app

Open the platform share sheet for text, URLs or a file. Use it when the user chooses where content should go.

## Share a message or file

```tsx
import { share } from 'kuito';

const result = await share(
  { message: 'Severance', url: 'https://www.tvmaze.com/shows/44933', title: 'A show' },
  { dialogTitle: 'Share a show', subject: 'Watch this' },
);

if (result.action === 'shared') console.log('shared with', result.activityType);
```

## Behavior and limits

Await the result and treat dismissal as normal. Share local media by its supported file URI and keep the file available until the share action completes. Available destinations and activity results differ by platform; do not assume the receiver actually consumed the content.

## Continue

Read [File system](file-system.md) for the related workflow. The API reference lists every method, option, event and return type.
