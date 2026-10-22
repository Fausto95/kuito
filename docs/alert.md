# Ask for confirmation with alert and prompt

Show a system alert for a decision that interrupts the current task. Use prompt for a short text response; use a screen or Sheet for a larger form.

## Confirm an action

```tsx
import { alert, prompt } from 'kuito';

export async function confirmDelete(
  episodeId: string,
  removeEpisode: (id: string) => Promise<void>,
) {
  const remove = { text: 'Delete', style: 'destructive' } as const;
  const picked = await alert({
    title: 'Delete episode?',
    message: 'It leaves your downloads.',
    buttons: [{ text: 'Cancel', style: 'cancel' }, remove],
  });

  if (picked === remove) await removeEpisode(episodeId);
}

export async function askName(listId: string, renameList: (id: string, name: string) => void) {
  const answer = await prompt({ title: 'Rename list' });

  if (answer?.button.text === 'OK' && typeof answer.value === 'string')
    renameList(listId, answer.value);
}
```

## Behavior and limits

Buttons carry their action and style. A destructive style communicates the consequence but does not perform the operation for you. Handle dismissal as a normal outcome. Keep title and message short; do not use an alert as a replacement for persistent validation beside a form field.

## Continue

Read [Action sheet](action-sheet.md) for the related workflow. The API reference lists every method, option, event and return type.
