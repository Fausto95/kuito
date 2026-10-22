import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { child, children, nameOf, type AstNode } from '../ast.ts';
import { isKuitoModule } from '../parse.ts';

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The files `import … from 'kuito'` reads: the root entry and the capabilities it re-exports. */
const KUITO_ENTRIES = new Set(
  ['ui', 'ui/index.ts', 'native', 'native/index.ts'].map((path) => resolve(SOURCE, path)),
);

/** The capabilities the root entry exports as namespaces: `export * as haptics from './haptics'`. */
export const KUITO_NAMESPACES = new Set(
  [
    ...readFileSync(resolve(SOURCE, 'native/index.ts'), 'utf8').matchAll(
      /^export \* as (\w+) from/gm,
    ),
  ].map(([, name]) => name),
);

/** Whether `from`, imported by `file`, is Kuito's root entry: `'kuito'`, or its files by path. */
export function isKuitoSource(from: string, file: string): boolean {
  if (isKuitoModule(from)) return true;

  return /^[./]/.test(from) && KUITO_ENTRIES.has(resolve(dirname(file), from));
}

/** The local names `file` imports Kuito's `exported` as: `signal`, or `s` for `signal as s`. */
export function kuitoImports(root: AstNode, file: string, exported: string): Set<string> {
  const found = new Set<string>();

  for (const statement of children(root, 'body')) {
    const from = child(statement, 'source')?.value;

    if (statement.type !== 'ImportDeclaration' || typeof from !== 'string') continue;
    if (!isKuitoSource(from, file)) continue;

    for (const specifier of children(statement, 'specifiers')) {
      const local = nameOf(child(specifier, 'local'));

      if (specifier.type === 'ImportSpecifier' && nameOf(child(specifier, 'imported')) === exported)
        if (local) found.add(local);
    }
  }

  return found;
}
