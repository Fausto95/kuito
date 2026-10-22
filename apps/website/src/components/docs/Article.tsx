import type { MouseEvent } from 'react';

/** Copies the code of the block whose copy button was clicked; the buttons come with the generated HTML. */
function onArticleClick(event: MouseEvent<HTMLElement>) {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button.code-copy');

  if (!button) return;

  const code = button.closest('figure')?.querySelector('pre')?.textContent ?? '';

  void navigator.clipboard.writeText(code).then(() => {
    button.dataset.copied = 'true';

    window.setTimeout(() => {
      delete button.dataset.copied;
    }, 1500);
  });
}

/** A documentation page body: HTML produced by `scripts/generate-docs.ts` from the repository markdown. */
export function Article({ html }: { html: string }) {
  return (
    <div className="prose" onClick={onArticleClick} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
