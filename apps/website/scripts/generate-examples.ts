/** Index complete documentation examples against the API. Never clip code or mine demos. */
import ts from 'typescript';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeBlocks, isPartial } from './code-blocks.ts';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(site, '../..');

type Entry = {
  id: string;
  kind: string;
  source: { file: string; line: number } | null;
  type: string;
  propsType?: string;
  members: unknown[];
  overloads: unknown[];
};

type Example = {
  file: string;
  line: number;
  code: string;
  title: string;
  via?: string;
  viaSection?: 'components' | 'apis';
};

const reference = JSON.parse(
  await readFile(resolve(site, 'src/content/reference.generated.json'), 'utf8'),
) as { entries: Entry[] };
const ids = new Set(reference.entries.map((entry) => entry.id));

async function filesUnder(dir: string, suffix: string): Promise<string[]> {
  const files: string[] = [];

  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) files.push(...(await filesUnder(path, suffix)));
    else if (entry.name.endsWith(suffix)) files.push(path);
  }

  return files.sort();
}

const virtual = new Map<string, Example>();

for (const file of [
  ...(await filesUnder(resolve(repo, 'docs'), '.md')),
  ...(await filesUnder(resolve(site, 'content'), '.md')),
]) {
  const markdown = await readFile(file, 'utf8');

  for (const [i, block] of codeBlocks(markdown).entries()) {
    if (isPartial(block) || !/^tsx?$/.test(block.lang)) continue;

    const preceding = markdown
      .split('\n')
      .slice(0, block.line - 2)
      .join('\n');
    const headings = [...preceding.matchAll(/^#{1,3} (.+)$/gm)];
    const title = headings.at(-1)?.[1].replace(/`/g, '') ?? 'Example';

    virtual.set(resolve(repo, `.snippets/${relative(repo, file)}.${i}.${block.lang}`), {
      file: relative(repo, file),
      line: block.line,
      code: block.code,
      title,
    });
  }
}

const dedicated = new Map<string, Example>();

for (const file of await filesUnder(resolve(site, 'content/api/examples'), '.tsx')) {
  const id = file.split('/').at(-1)!.slice(0, -4);

  if (!ids.has(id)) throw new Error(`Orphan example: ${id}`);

  const code = (await readFile(file, 'utf8')).trimEnd();
  const title = /^\/\/ (.+)/.exec(code)?.[1] ?? `Use ${id}`;
  const example = { file: relative(repo, file), line: 1, code, title };

  dedicated.set(id, example);
  virtual.set(resolve(repo, '.snippets', relative(repo, file)), example);
}

const options: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  lib: ['lib.es2024.d.ts'],
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  moduleDetection: ts.ModuleDetectionKind.Force,
  jsx: ts.JsxEmit.Preserve,
  jsxFactory: '__kuitoJSX',
  jsxFragmentFactory: '__kuitoFragment',
  types: [],
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  allowImportingTsExtensions: true,
  baseUrl: repo,
  paths: {
    kuito: ['src/ui/index.ts'],
    'kuito/config': ['src/cli/kuito-config.ts'],
    'kuito/tests': ['src/tests/index.ts'],
  },
};
const host = ts.createCompilerHost(options);
const originalRead = host.readFile.bind(host);
const originalExists = host.fileExists.bind(host);

host.readFile = (path) => virtual.get(path)?.code ?? originalRead(path);
host.fileExists = (path) => virtual.has(path) || originalExists(path);

const program = ts.createProgram(
  [
    ...virtual.keys(),
    ...['globals', 'css', 'assets'].map((name) => resolve(repo, `src/ui/${name}.d.ts`)),
  ],
  options,
  host,
);
const checker = program.getTypeChecker();
const declarations = new Map<string, string[]>();

for (const entry of reference.entries) {
  if (!entry.source) continue;

  const key = `${entry.source.file}:${entry.source.line}`;

  declarations.set(key, [...(declarations.get(key) ?? []), entry.id]);
}

function entryIds(symbol: ts.Symbol | undefined): string[] {
  if (!symbol) return [];

  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const found = new Set<string>();

  for (const declaration of resolved.declarations ?? []) {
    const source = declaration.getSourceFile();
    const key = `${relative(repo, source.fileName)}:${source.getLineAndCharacterOfPosition(declaration.getStart()).line + 1}`;

    for (const id of declarations.get(key) ?? []) found.add(id);
  }

  const globalId = `global.${resolved.name}`;

  if (
    ids.has(globalId) &&
    (resolved.declarations ?? []).some((d) => d.getSourceFile().isDeclarationFile)
  )
    found.add(globalId);

  return [...found];
}

const candidates = new Map<string, Example[]>();

for (const [path, example] of virtual) {
  const source = program.getSourceFile(path)!;
  const used = new Set<string>();

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;

    if (ts.isIdentifier(node)) {
      for (const id of entryIds(checker.getSymbolAtLocation(node))) used.add(id);
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  for (const id of used) candidates.set(id, [...(candidates.get(id) ?? []), example]);
}

const result: Record<string, Example[]> = {};

for (const entry of reference.entries) {
  const own = dedicated.get(entry.id);

  if (own && entry.kind !== 'type' && !candidates.get(entry.id)?.includes(own))
    throw new Error(`Example does not use ${entry.id}: ${own.file}`);

  const examples = candidates.get(entry.id) ?? [];
  const sorted = examples.sort((a, b) => a.code.split('\n').length - b.code.split('\n').length);
  const chosen = own ? [own] : sorted.slice(0, 1);

  if (chosen.length) result[entry.id] = chosen;
}

// A props/options/result type is illustrated through the API that consumes it.
// Show that relationship beside the example instead of pretending it names the type.
let added = true;

while (added) {
  added = false;

  for (const entry of reference.entries) {
    if (entry.kind !== 'type' || result[entry.id]) continue;

    const name = entry.id.split('.').at(-1)!;
    const lenders = reference.entries.filter(
      (candidate) =>
        candidate.id !== entry.id &&
        result[candidate.id] &&
        new RegExp(`\\b${name}\\b`).test(
          JSON.stringify([
            candidate.type,
            candidate.propsType,
            candidate.overloads,
            candidate.members,
          ]),
        ),
    );

    lenders.sort(
      (a, b) =>
        Number(a.kind === 'type') - Number(b.kind === 'type') ||
        Number(b.kind === 'component') - Number(a.kind === 'component'),
    );

    const lender = lenders[0];

    if (lender) {
      result[entry.id] = result[lender.id].map((example) => ({
        ...example,
        via: example.via ?? lender.id,
        viaSection: example.viaSection ?? (lender.kind === 'component' ? 'components' : 'apis'),
      }));

      added = true;
    }
  }
}

const output = resolve(site, 'src/content/generated/usage.json');

await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(result) + '\n');

const missing = reference.entries.filter((entry) => !result[entry.id]);

console.log(`Complete examples: ${Object.keys(result).length}/${reference.entries.length} exports`);
if (missing.length) console.log('Missing: ' + missing.map((entry) => entry.id).join(', '));
