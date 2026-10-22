// `kuito test`: an app's test files, each compiled by the app's compiler and
// run in a headless host of its own by Node's test runner (docs/testing.md).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';
import { NODE_TYPESCRIPT } from '../cli/config.ts';
import { createSourceCompiler } from '../dev/compiler.ts';
import { loadCatalog } from '../dev/modules/catalog.ts';
import type { Platform } from '../style/stylesheet.ts';
import { HeadlessHost } from './host.ts';
import * as api from './index.ts';
import { useHost } from './session.ts';

const TEST_FILE = /\.test\.tsx?$/;

/** Not the app's sources: dependencies, build output and Kuito's own state. */
const SKIPPED = new Set(['node_modules', 'dist', '.kuito', '.git']);

/** The app's test files under `root`, sorted. */
export async function findTests(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && TEST_FILE.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter(
      (file) =>
        !relative(root, file)
          .split(/[\\/]/)
          .some((part) => SKIPPED.has(part)),
    )
    .sort();
}

const nodeRequire = createRequire(import.meta.url);

/**
 * Stacks through the bundle at `path` name the app's files and lines: in
 * Node's realm, where assertions fail, and in the kernel's. Node maps only
 * the modules it loads itself, not code a vm context runs.
 */
function mapStacks(host: HeadlessHost, path: string, map: string, directory: string): void {
  const trace = new TraceMap(map);
  const prepare = (error: Error, frames: NodeJS.CallSite[]) => {
    const lines = frames.map((frame) => {
      const line = frame.getLineNumber();
      const column = frame.getColumnNumber();
      const found =
        frame.getFileName() === path && line !== null && column !== null
          ? originalPositionFor(trace, { line, column: column - 1 })
          : null;

      const where = found?.source
        ? `${resolve(directory, found.source)}:${found.line}:${found.column + 1}`
        : `${frame.getFileName() ?? '<anonymous>'}:${line ?? 0}:${column ?? 0}`;

      return `    at ${frame.getFunctionName() ?? '<anonymous>'} (${where})`;
    });

    // V8's own first line: Node's inspect adds an error's code to it.
    const header = error.message ? `${error.name}: ${error.message}` : error.name;

    return `${header}\n${lines.join('\n')}`;
  };

  Error.prepareStackTrace = prepare;
  host.evaluate('(prepare) => { Error.prepareStackTrace = prepare; }', 'kuito://stacks', prepare);
}

/**
 * Runs one test file: compiled like the app, evaluated in a headless host
 * whose `kuito/tests` renders into it. Node's test runner, in this
 * process, runs the tests it defines.
 */
export async function runTestFile(file: string, root: string, platform: Platform): Promise<void> {
  const output = mkdtempSync(join(tmpdir(), 'kuito-test-'));

  try {
    const compiled = await createSourceCompiler({ platform, outputDir: output, root, test: true })(
      file,
    );
    const host = await HeadlessHost.create({ catalog: await loadCatalog(root) });

    // CommonJS interop reads `__esModule` to find named exports.
    host.provide('kuito/tests', { __esModule: true, ...api });

    for (const name of new Set(compiled.code.match(/(?<=require\(")node:[^"]+(?="\))/g)))
      host.provide(name, nodeRequire(name));

    useHost(host);

    if (compiled.map) mapStacks(host, compiled.path, compiled.map, output);

    host.evaluate(compiled.code, compiled.path);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
}

/** Runs `files` (every test of the app by default); resolves with the runner's exit code. */
export async function runTests(
  root: string,
  platform: Platform,
  files?: readonly string[],
): Promise<number> {
  const tests = files?.length ? files.map((file) => resolve(root, file)) : await findTests(root);

  if (tests.length === 0) {
    console.error(`No test files in ${root}: name them <name>.test.tsx (docs/testing.md)`);

    return 1;
  }

  const launchers = mkdtempSync(join(tmpdir(), 'kuito-tests-'));
  const runner = new URL('./runner.ts', import.meta.url).href;

  try {
    const entries = tests.map((test, index) => {
      const launcher = join(launchers, `${index}-${basename(test)}.mjs`);

      writeFileSync(
        launcher,
        `import { runTestFile } from ${JSON.stringify(runner)};\n` +
          `await runTestFile(${JSON.stringify(test)}, ${JSON.stringify(root)}, ${JSON.stringify(platform)});\n`,
      );

      return launcher;
    });

    return await new Promise<number>((done, fail) => {
      const child = spawn(
        process.execPath,
        [...NODE_TYPESCRIPT, '--enable-source-maps', '--test', ...entries],
        {
          cwd: root,
          stdio: 'inherit',
        },
      );

      child.on('error', fail);
      child.on('exit', (code) => done(code ?? 1));
    });
  } finally {
    rmSync(launchers, { recursive: true, force: true });
  }
}
