/**
 * Find real usage of every public export in the repository's apps and documentation.
 *
 * The starter template, the demos and the code blocks of `docs/*.md` form one
 * TypeScript program whose `kuito` imports resolve into `src/`. Every JSX tag,
 * call, property access and type reference is resolved with the checker to the
 * declaration it names; when that declaration is the one a reference entry was
 * generated from (`reference.generated.json` records file and line), the
 * enclosing statement or element becomes an example on that entry's page.
 *
 * An example is code that exists, with its file and line; an export nothing uses
 * falls back to `content/api/examples/<id>.tsx`. Output: `src/content/generated/usage.json`.
 *
 * Usage: node scripts/generate-usage.ts   (after api:generate)
 */
import ts from 'typescript';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import docsMap from '../src/content/docs-map.json' with { type: 'json' };
import { codeBlocks } from './code-blocks.ts';

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, '..');
const repo = resolve(site, '../..');
const output = resolve(site, 'src/content/generated/usage.json');
const MAX_LINES = 14;
/** Snippets per page: a component shows a minimal one and its common patterns. */
const MAX_PER_ENTRY = { component: 3, other: 1 };

type Usage = { file: string; line: number; code: string; rank: number; via?: string };

type Entry = {
  id: string;
  kind: string;
  source: { file: string; line: number } | null;
  propsType?: string;
};

async function listSources(dir: string): Promise<string[]> {
  const out: string[] = [];

  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (item.name === 'node_modules' || item.name.startsWith('.')) continue;

    const path = join(dir, item.name);

    if (item.isDirectory()) out.push(...(await listSources(path)));
    else if (/\.(ts|tsx)$/.test(item.name) && !item.name.endsWith('.d.ts')) out.push(path);
  }

  return out;
}

/** Where a snippet comes from: the documentation's examples teach, the apps show. */
function rankOf(file: string): number {
  if (file.startsWith('docs/')) return 3;
  if (file.startsWith('templates/')) return 2;

  return 0;
}

/** The documentation pages an export belongs to; an example from them outranks any other. */
const DOC_BY_FILE: [RegExp, string][] = [
  [/^src\/ui\/(reactivity|store)\.ts$/, 'docs/reactivity.md'],
  [
    /^src\/(ui\/motion|runtime\/(animation-specs|compose|derived|effects|gesture-specs))\.ts$/,
    'docs/motion.md',
  ],
  [/^src\/ui\/navigation\.tsx$/, 'docs/navigation.md'],
  [/^src\/ui\/primitives\.ts$/, 'docs/primitives.md'],
  [/^src\/ui\/flat-list\.tsx$/, 'docs/lists.md'],
  [/^src\/ui\/flow\.ts$/, 'docs/control-flow.md'],
  [/^src\/ui\/globals\.d\.ts$/, 'docs/web-apis.md'],
  [/^src\/native\/define-module\.ts$/, 'docs/native-modules.md'],
];
const docOfPage = new Map(
  Object.entries(docsMap as Record<string, { page?: string; file?: string }>)
    .filter(([, entry]) => entry.page && entry.file?.startsWith('docs/'))
    .map(([, entry]) => [entry.page as string, entry.file as string]),
);

function preferredDocs(entry: Entry): string[] {
  const docs: string[] = [];
  const namespace = entry.id.includes('.') ? entry.id.slice(0, entry.id.indexOf('.')) : entry.id;
  const merged = docOfPage.get(namespace) ?? docOfPage.get(entry.id);

  if (merged) docs.push(merged);

  for (const [pattern, doc] of DOC_BY_FILE)
    if (entry.source && pattern.test(entry.source.file)) docs.push(doc);

  return docs;
}

/** How much a snippet shows: props and arguments, readable children, a result; not one-liners or glyphs. */
function informativeness(code: string): number {
  const lines = code.split('\n').length;
  let score = Math.min(6, (code.match(/\b[\w-]+=\{|\b[\w-]+="/g) ?? []).length) * 2;

  if (/>[^<]*[A-Za-z]{3,}[^<]*</.test(code)) score += 3;
  if (/^\s*(const|let)\s+\w+\s*=/.test(code)) score += 1;
  if (/\(\s*\)/.test(code) && lines === 1) score -= 1;
  if (lines === 1 && code.length < 40) score -= 3;
  if (lines > 8) score -= (lines - 8) * 1.5;
  if (code.includes('// …')) score -= 6;
  if (/\(\s*(\d|'|"|\{|\[)/.test(code)) score += 2;
  if (/[^\p{ASCII}]/u.test(code.replace(/\/\/.*$/gm, ''))) score -= 4;

  return score;
}

/** `node.getText()` starts at the node, so its first line has lost the indentation its other lines keep. */
function textAt(node: ts.Node): string {
  const column = node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).character;

  return ' '.repeat(column) + node.getText();
}

function dedent(text: string): string {
  const lines = text
    .replace(/^\s*\n/, '')
    .trimEnd()
    .split('\n');
  const indent = Math.min(
    ...lines.filter((line) => line.trim()).map((line) => /^\s*/.exec(line)![0].length),
  );

  return lines.map((line) => line.slice(indent)).join('\n');
}

function clip(text: string, closing?: string): string {
  const lines = text.split('\n');

  if (lines.length <= MAX_LINES) return text;

  return [
    ...lines.slice(0, MAX_LINES - (closing ? 2 : 1)),
    '  // …',
    ...(closing ? [closing] : []),
  ].join('\n');
}

async function main() {
  const reference = JSON.parse(
    await readFile(resolve(site, 'src/content/reference.generated.json'), 'utf8'),
  ) as { entries: Entry[] };
  const entryAt = new Map<string, string>();

  for (const entry of reference.entries) {
    if (entry.source) entryAt.set(`${entry.source.file}:${entry.source.line}`, entry.id);
  }

  const files = [
    ...(await listSources(resolve(repo, 'demo'))).filter(
      (file) => !/\/demo\/(app|reel)\//.test(file),
    ),
    ...(await listSources(resolve(repo, 'templates/app'))),
  ];
  const virtual = new Map<string, { code: string; file: string; line: number }>();

  for (const name of (await readdir(resolve(repo, 'docs'))).filter((name) =>
    name.endsWith('.md'),
  )) {
    const markdown = await readFile(resolve(repo, 'docs', name), 'utf8');

    codeBlocks(markdown).forEach((block, index) => {
      virtual.set(resolve(repo, `docs/.snippets/${name.slice(0, -3)}.${index}.${block.lang}`), {
        code: block.code,
        file: `docs/${name}`,
        line: block.line,
      });
    });
  }

  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.Preserve,
    jsxFactory: '__kuitoJSX',
    jsxFragmentFactory: '__kuitoFragment',
    types: [],
    lib: ['lib.es2022.d.ts'],
    skipLibCheck: true,
    noEmit: true,
    allowImportingTsExtensions: true,
    allowJs: false,
    baseUrl: repo,
    paths: {
      kuito: ['src/ui/index.ts'],
      'kuito/config': ['src/cli/kuito-config.ts'],
      'kuito/tests': ['src/tests/index.ts'],
    },
  };
  const host = ts.createCompilerHost(options);
  const readFileOriginal = host.readFile.bind(host);
  const fileExistsOriginal = host.fileExists.bind(host);

  host.readFile = (path) => virtual.get(path)?.code ?? readFileOriginal(path);
  host.fileExists = (path) => virtual.has(path) || fileExistsOriginal(path);

  host.getSourceFile = (path, languageVersion) => {
    const text = host.readFile(path);

    return text === undefined ? undefined : ts.createSourceFile(path, text, languageVersion, true);
  };

  const declarations = ['src/ui/globals.d.ts', 'src/ui/css.d.ts', 'src/ui/assets.d.ts'].map(
    (file) => resolve(repo, file),
  );
  const program = ts.createProgram([...files, ...virtual.keys(), ...declarations], options, host);
  const checker = program.getTypeChecker();

  const usage = new Map<string, Usage[]>();
  const seen = new Set<string>();

  function entryOf(symbol: ts.Symbol | undefined): string | undefined {
    if (!symbol) return undefined;

    const resolved =
      symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;

    for (const decl of [resolved.valueDeclaration, ...(resolved.declarations ?? [])]) {
      if (!decl) continue;

      const file = relative(repo, decl.getSourceFile().fileName).split('\\').join('/');
      const line = decl.getSourceFile().getLineAndCharacterOfPosition(decl.getStart()).line + 1;
      const id = entryAt.get(`${file}:${line}`);

      if (id) return id;
    }

    return undefined;
  }

  function statementOf(node: ts.Node): ts.Node {
    let current: ts.Node = node;

    while (
      current.parent &&
      !ts.isSourceFile(current.parent) &&
      !ts.isStatement(current) &&
      !ts.isJsxElement(current.parent) &&
      !ts.isJsxSelfClosingElement(current)
    )
      current = current.parent;

    return current;
  }

  function record(id: string, node: ts.Node, sourceFile: ts.SourceFile, snippet: string) {
    const origin = virtual.get(sourceFile.fileName);
    const file = origin ? origin.file : relative(repo, sourceFile.fileName).split('\\').join('/');
    const line =
      (origin ? origin.line - 1 : 0) +
      sourceFile.getLineAndCharacterOfPosition(node.getStart()).line +
      1;
    const code = snippet.replace(/^(\s*)void (?=[\w<(])/gm, '$1');
    const key = id + '\n' + code.replace(/\s+/g, ' ');

    if (seen.has(key)) return;
    seen.add(key);
    if (!usage.has(id)) usage.set(id, []);
    usage.get(id)!.push({ file, line, code, rank: rankOf(file) });
  }

  function jsxSnippet(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string {
    const element =
      ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent) ? node.parent : node;
    const text = dedent(textAt(element));

    if (ts.isJsxElement(element)) return clip(text, element.closingElement.getText());

    return clip(text);
  }

  function visit(node: ts.Node, sourceFile: ts.SourceFile) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const id = entryOf(checker.getSymbolAtLocation(node.tagName));

      if (id) record(id, node, sourceFile, jsxSnippet(node));
    } else if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const callee = node.expression;
      const name = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
      const id = entryOf(checker.getSymbolAtLocation(name));

      if (id) {
        const snippet = clip(dedent(textAt(statementOf(node))));

        record(id, node, sourceFile, snippet);

        const parent = id.includes('.') ? id.slice(0, id.lastIndexOf('.')) : null;

        if (
          parent &&
          reference.entries.some((entry) => entry.id === parent && entry.kind === 'namespace')
        )
          record(parent, node, sourceFile, snippet);
      }
    } else if (
      ts.isPropertyAccessExpression(node) &&
      !(ts.isCallExpression(node.parent) && node.parent.expression === node)
    ) {
      // `routes.home` or `platform.os`: the member first, else the object it is read from.
      const id =
        entryOf(checker.getSymbolAtLocation(node.name)) ??
        (ts.isIdentifier(node.expression)
          ? entryOf(checker.getSymbolAtLocation(node.expression))
          : undefined);

      if (id) record(id, node, sourceFile, clip(dedent(textAt(statementOf(node)))));
    } else if (ts.isTypeReferenceNode(node)) {
      const id = entryOf(checker.getSymbolAtLocation(node.typeName));

      if (id) record(id, node, sourceFile, clip(dedent(textAt(statementOf(node)))));
    }

    ts.forEachChild(node, (child) => visit(child, sourceFile));
  }

  for (const sourceFile of program.getSourceFiles()) {
    if (!files.includes(sourceFile.fileName) && !virtual.has(sourceFile.fileName)) continue;
    visit(sourceFile, sourceFile);
  }

  const entryById = new Map(reference.entries.map((entry) => [entry.id, entry]));
  const scoreOf = (item: Usage, id: string) =>
    item.rank * 10 +
    informativeness(item.code) +
    (preferredDocs(entryById.get(id)!).includes(item.file) ? 25 : 0);
  const result: Record<string, Omit<Usage, 'rank'>[]> = {};

  const kindOf = new Map(reference.entries.map((entry) => [entry.id, entry.kind]));

  for (const [id, items] of usage) {
    result[id] = items
      .sort((a, b) => scoreOf(b, id) - scoreOf(a, id))
      .slice(0, kindOf.get(id) === 'component' ? MAX_PER_ENTRY.component : MAX_PER_ENTRY.other)
      .map(({ rank: _rank, ...item }) => item);
  }

  // An export nothing in the repository uses gets a hand-written snippet from the website,
  // `content/api/examples/<id>.tsx`, when there is one. Added before the types borrow, so a
  // props type borrows its component's hand-written example too.
  const examplesDir = resolve(site, 'content/api/examples');
  const handWritten = existsSync(examplesDir) ? await readdir(examplesDir) : [];

  for (const name of handWritten) {
    if (!name.endsWith('.tsx')) continue;

    const id = name.slice(0, -4);

    if (result[id]) continue;

    const code = (await readFile(join(examplesDir, name), 'utf8')).trimEnd();

    result[id] = [{ file: `apps/website/content/api/examples/${name}`, line: 1, code }];
  }

  // A type apps never name still shows up where it matters: the exports whose
  // signatures, props or members mention it (an options type through its
  // function, a props type through its component) lend their examples.
  const mentions = new Map<string, string[]>();

  for (const entry of reference.entries) {
    if (!result[entry.id] || entry.kind === 'type') continue;

    const text = JSON.stringify(entry);

    for (const name of new Set(text.match(/\b[A-Z][A-Za-z0-9_]*\b/g) ?? [])) {
      if (!mentions.has(name)) mentions.set(name, []);
      mentions.get(name)!.push(entry.id);
    }
  }

  for (const entry of reference.entries) {
    if (entry.kind !== 'type' || result[entry.id]) continue;

    const name = entry.id.replace(/^config\./, '').replace(/^\w+\./, '');
    const lenders = (mentions.get(name) ?? []).filter((id) => id !== entry.id).slice(0, 2);
    const borrowed = lenders.flatMap((id) =>
      result[id].slice(0, 1).map((item) => ({ ...item, via: id })),
    );

    if (borrowed.length) result[entry.id] = borrowed;
  }

  const configFile = 'templates/app/kuito.config.ts';
  const configText = await readFile(resolve(repo, configFile), 'utf8');

  {
    // Every configuration type is illustrated by the starter's config file.
    const code = clip(dedent(configText));

    for (const entry of reference.entries) {
      if (entry.id.startsWith('config.') && !result[entry.id])
        result[entry.id] = [{ file: configFile, line: 1, code }];
    }
  }

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result) + '\n');

  const byKind = new Map<string, { total: number; covered: number }>();

  for (const entry of reference.entries) {
    const stat = byKind.get(entry.kind) ?? { total: 0, covered: 0 };

    stat.total += 1;
    if (result[entry.id]) stat.covered += 1;
    byKind.set(entry.kind, stat);
  }

  console.log(
    'Usage examples: ' +
      [...byKind].map(([kind, stat]) => `${kind} ${stat.covered}/${stat.total}`).join(', '),
  );
}

await main();
