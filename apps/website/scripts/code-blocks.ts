/** A fenced code block of a markdown file: ```lang info. */
export type CodeBlock = { lang: string; info: string; code: string; line: number };

/** The TypeScript and JavaScript blocks of a markdown document, with the line their code starts on. */
export function codeBlocks(markdown: string): CodeBlock[] {
  const lines = markdown.split('\n');
  const blocks: CodeBlock[] = [];
  let open: { lang: string; info: string; start: number; body: string[] } | null = null;

  lines.forEach((text, index) => {
    const fence = /^\s*```\s*([\w-]*)\s*(.*)$/.exec(text);

    if (!open && fence)
      open = { lang: fence[1], info: fence[2].trim(), start: index + 2, body: [] };
    else if (open && /^\s*```\s*$/.test(text)) {
      if (/^(tsx?|jsx?)$/.test(open.lang))
        blocks.push({
          lang: open.lang,
          info: open.info,
          code: open.body.join('\n'),
          line: open.start,
        });

      open = null;
    } else if (open) open.body.push(text);
  });

  return blocks;
}

/** A block marked ```tsx partial: a fragment of a larger program, shown as one and not compiled. */
export const isPartial = (block: CodeBlock) => block.info.split(/\s+/).includes('partial');
