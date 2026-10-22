/**
 * Every TypeScript example the reader sees compiles against the current API.
 *
 * The ```ts and ```tsx blocks of `docs/*.md`, `README.md`, `CONTRIBUTING.md` and the
 * site's English pages (`content/**.md`), and the hand-written API examples
 * (`content/api/examples/*.tsx`), are type-checked as modules of one program with the
 * app settings (`tsconfig.app.json`), `kuito`, `kuito/config` and `kuito/tests`
 * resolving into `src/`. A block marked ```tsx partial is a fragment: it is shown
 * with a label and not compiled. Translations copy code verbatim, so the English
 * blocks stand for them.
 *
 * Usage: node scripts/check-snippets.ts   (exits 1 on any error, each at file:line)
 */
import ts from 'typescript';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeBlocks, isPartial } from './code-blocks.ts';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(site, '../..');

async function filesUnder(dir: string, suffix: string): Promise<string[]> {
  const found: string[] = [];

  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);

    if (item.isDirectory()) found.push(...(await filesUnder(path, suffix)));
    else if (item.name.endsWith(suffix)) found.push(path);
  }

  return found;
}

const markdown = [
  ...(await filesUnder(resolve(repo, 'docs'), '.md')),
  resolve(repo, 'README.md'),
  resolve(repo, 'CONTRIBUTING.md'),
  ...(await filesUnder(resolve(site, 'content'), '.md')),
];
/** Virtual module path → where its code is in the repository. */
const snippets = new Map<string, { code: string; file: string; line: number }>();
let partial = 0;

for (const path of markdown) {
  const file = relative(repo, path);

  codeBlocks(await readFile(path, 'utf8')).forEach((block, index) => {
    if (isPartial(block)) partial++;
    else if (block.lang === 'ts' || block.lang === 'tsx')
      snippets.set(resolve(repo, `.snippets/${file}.${index}.${block.lang}`), {
        code: block.code,
        file,
        line: block.line,
      });
  });
}

for (const path of await filesUnder(resolve(site, 'content/api/examples'), '.tsx')) {
  snippets.set(resolve(repo, '.snippets', relative(repo, path)), {
    code: await readFile(path, 'utf8'),
    file: relative(repo, path),
    line: 1,
  });
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
const readFileOriginal = host.readFile.bind(host);
const fileExistsOriginal = host.fileExists.bind(host);

host.readFile = (path) => snippets.get(path)?.code ?? readFileOriginal(path);
host.fileExists = (path) => snippets.has(path) || fileExistsOriginal(path);

const declarations = ['src/ui/globals.d.ts', 'src/ui/css.d.ts', 'src/ui/assets.d.ts'].map((file) =>
  resolve(repo, file),
);
const program = ts.createProgram([...snippets.keys(), ...declarations], options, host);
const errors: string[] = [];

for (const [path, snippet] of snippets) {
  const source = program.getSourceFile(path);

  if (!source) continue;

  for (const diagnostic of ts.getPreEmitDiagnostics(program, source)) {
    const line = source.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line;
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n  ');

    errors.push(`${snippet.file}:${snippet.line + line}: ${message}`);
  }
}

console.log(
  `Snippets: ${snippets.size} compiled, ${partial} marked partial, ${errors.length} errors`,
);

for (const error of errors) console.log('  ' + error);
if (errors.length) process.exitCode = 1;
