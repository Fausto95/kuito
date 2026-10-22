import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync, type Comment, type OxcError, type Program } from 'oxc-parser';
import { isAstNode, lineTable, type AstNode } from './ast.ts';
import { codeFrame } from './source-location.ts';

/** One source module as every Kuito pass reads it: parsed once per content. */
export interface ParsedModule {
  id: string;
  /** The module's path from the working directory, as ids and messages name it. */
  file: string;
  source: string;
  program: Program;
  /** The same program, for passes that walk it generically. */
  root: AstNode;
  comments: Comment[];
  errors: OxcError[];
  locate: (offset: number) => { line: number; column: number };
  /** An error at `start` that Rolldown reports with its file, line and code frame. */
  error: (message: string, start: number) => Error & { loc: object; frame: string };
}

const SOURCE = /\.[jt]sx?(?:\?|$)/;
const JSX = /\.[jt]sx(?:\?|$)/;

/** Kuito's own root: under the app's node_modules once installed from npm. */
const KUITO = fileURLToPath(new URL('../../', import.meta.url));

/**
 * A source module Kuito's passes compile: the app's own and Kuito's, which
 * ships its sources uncompiled. Other packages are left as published.
 */
export const isAppModule = (id: string, kuito = KUITO) =>
  SOURCE.test(id) && !(id.startsWith(kuito) ? id.slice(kuito.length) : id).includes('node_modules');

export const isJsxModule = (id: string) => JSX.test(id);

export const isKuitoModule = (specifier: string) =>
  specifier === 'kuito' || specifier.startsWith('kuito/');

/** An import of a package: not a relative or absolute path, and not Kuito's own API. */
export const isPackageSpecifier = (specifier: string) =>
  !/^[./]/.test(specifier) && !isKuitoModule(specifier);

/** A module Rolldown made up (`\0kuito:routes.tsx`) rather than read from a file. */
export const isVirtualModule = (id: string) => id.startsWith('\0');

const parsed = new Map<string, { hash: string; module: ParsedModule }>();

/**
 * The module for `source`, parsed once while its content stays the same:
 * every Kuito plugin that reads `id` shares one parse. Only the latest
 * content per id is kept.
 */
export function parseModule(id: string, source: string): ParsedModule {
  const hash = createHash('sha1').update(source).digest('hex');
  const last = parsed.get(id);

  if (last?.hash === hash) return last.module;

  const result = parseSync(id, source);
  const root: unknown = result.program;

  if (!isAstNode(root)) throw new Error(`${id}: expected an Oxc program`);

  const locate = lineTable(source);
  const file = relative(process.cwd(), resolve(id)).replaceAll('\\', '/');
  const module: ParsedModule = {
    id,
    file,
    source,
    program: result.program,
    root,
    comments: result.comments,
    errors: result.errors,
    locate,
    error(message, start) {
      const at = locate(start);

      return Object.assign(new Error(message), {
        loc: { file: id, ...at },
        frame: codeFrame(source, at),
      });
    },
  };

  parsed.set(id, { hash, module });

  return module;
}

/** The module's first syntax error, located for Rolldown; null when it parsed. */
export function syntaxError({ id, errors, locate }: ParsedModule): Error | null {
  const [first] = errors;

  if (!first) return null;

  return Object.assign(new Error(first.message), {
    loc: { file: id, ...locate(first.labels?.[0]?.start ?? 0) },
    // Keep only the source lines: oxc's title, location header and border repeat `loc`.
    frame: (first.codeframe ?? '')
      .split('\n')
      .filter((line) => line.trim() && !/^\s*(x |,-\[|`-)/.test(line))
      .join('\n'),
  });
}
