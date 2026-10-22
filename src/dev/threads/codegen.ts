import MagicString, { Bundle } from 'magic-string';
import { transformSync } from 'rolldown/experimental';
import { applyEdits, editsWithin, type Edit } from '../edits.ts';
import type { Candidate, ModuleFunction } from './candidates.ts';
import { localName, type Occurrence, type ThreadCapture } from './captures.ts';

/** A pure call a function is wrapped in: `open` before it, `close` after. */
export interface Wrapper {
  open: string;
  close: string;
}

/** The thread tag `fn(function, rest)`. */
export const threadTag = (fn: string, rest: string): Wrapper => ({
  open: `/* @__PURE__ */ ${fn}(`,
  close: `, ${rest})`,
});

/**
 * The edits that wrap one function in `wrappers`, the first outermost. Every
 * wrapper is a pure call, so the bundler drops a function nobody uses and
 * everything it reaches. A wrapped expression is used wherever the function
 * is. A module function becomes a `var` at the top of the module, where its
 * declaration would have been hoisted to; its overload signatures go, since
 * they only overload a function declaration.
 */
export function wrapEdits(
  candidate: Pick<Candidate, 'node' | 'name' | 'kind' | 'declaration'>,
  moduleFunction: ModuleFunction | undefined,
  moduleStart: number,
  wrappers: readonly Wrapper[],
): Edit[] {
  const { node, name, kind } = candidate;
  const open = wrappers.map((wrapper) => wrapper.open).join('');
  const close = [...wrappers]
    .reverse()
    .map((wrapper) => wrapper.close)
    .join('');
  const hoist = (start: number, end: number, before: string, after: string): Edit[] => [
    { op: 'prependRight', at: start, text: before },
    { op: 'appendLeft', at: end, text: `${after}\n` },
    ...(start === moduleStart ? [] : [{ op: 'move' as const, start, end, to: moduleStart }]),
  ];

  // An expression's arrow is the component pass's: the tag goes between its
  // `__kuitoExpr(` and the arrow, which that pass left open for it.
  if (kind === 'expression')
    return [
      { op: 'appendLeft', at: node.start, text: open },
      { op: 'appendLeft', at: node.end, text: close },
    ];

  if (!candidate.declaration)
    return [
      { op: 'appendLeft', at: node.start, text: open },
      { op: 'appendRight', at: node.end, text: close },
    ];

  // Annotated `@__NO_SIDE_EFFECTS__`, it stays put: each wrapper a statement after it.
  if (!moduleFunction)
    return wrappers.map((wrapper): Edit => ({
      op: 'appendRight',
      at: node.end,
      text: `\n${wrapper.open.replace('/* @__PURE__ */ ', '')}${name}${wrapper.close};`,
    }));

  const { statement, signatures } = moduleFunction;
  const erased = signatures.map((signature): Edit => ({
    op: 'overwrite',
    start: signature.start,
    end: signature.end,
    text: '',
  }));

  if (statement.type === 'ExportDefaultDeclaration')
    return [
      {
        op: 'overwrite',
        start: statement.start,
        end: node.start,
        text: `export { ${name} as default };\n`,
      },
      ...erased,
      ...hoist(node.start, node.end, `var ${name} = ${open}`, `${close};`),
    ];

  return [
    ...erased,
    ...hoist(statement.start, node.end, '', `${close};`),
    { op: 'prependRight', at: node.start, text: `var ${name} = ${open}` },
  ];
}

/**
 * The candidate's UI-thread definition: its source with the earlier passes'
 * edits inside it, each captured member path read from a local.
 */
export function uiDefinition(
  id: string,
  source: string,
  candidate: Candidate,
  occurrences: Occurrence[],
  list: ThreadCapture[],
  edits: readonly Edit[],
  /** `file:line:column`, which dev builds name when the function runs slow. */
  location: string,
) {
  const { node, name, kind } = candidate;
  // Over the whole module, so the copy keeps its place in it for its map.
  const body = applyEdits(
    new MagicString(source).snip(node.start, node.end),
    editsWithin(edits, node.start, node.end),
  );
  const replaced = new Set<number>();

  for (const occurrence of occurrences)
    if (
      occurrence.path.includes('.') &&
      !replaced.has(occurrence.start) &&
      replaced.add(occurrence.start)
    )
      body.update(occurrence.start, occurrence.end, localName(occurrence.path));

  if (kind === 'expression') body.prepend('() => (').append(')');

  const locals = list.map((item, index) => `${localName(item.path)} = captures[${index}]`);
  const prelude = locals.length ? `var ${locals.join(', ')}; ` : '';
  const [before, after] =
    node.type === 'FunctionDeclaration'
      ? ['', ` return ${name};`]
      : name
        ? [`var ${name} = `, `; return ${name};`]
        : ['return (', ');'];

  return body
    .prepend(`__kuitoUI.define(${JSON.stringify(id)}, function (captures) { ${prelude}${before}`)
    .append(`${after} }, ${JSON.stringify(location)});`);
}

/**
 * The UI runtime evaluates a plain script, so lowering must not need helper
 * modules. It runs Hermes V1, which compiles ES2022 as written. The map
 * leads back to `filename`, through the definitions to the lines each
 * function was written on.
 */
export function lowerUI(
  filename: string,
  definitions: MagicString[],
): { code: string; map: string | null } {
  if (!definitions.length) return { code: '', map: null };

  const joined = new Bundle({ separator: '\n' });

  for (const definition of definitions) joined.addSource({ filename, content: definition });

  // Positions only: a crash report needs no copy of the source.
  const { sourcesContent: _content, ...inputMap } = joined.generateMap({ hires: true });
  const lowered = transformSync(filename.replace(/\.[jt]sx?$/, '') + '.ui.ts', joined.toString(), {
    lang: 'ts',
    target: 'es2022',
    sourcemap: true,
    inputMap,
  });

  if (/\brequire\(/.test(lowered.code))
    throw new Error(
      `UI-thread code in ${filename} lowers to a helper module the UI runtime cannot load; ` +
        'report the function that triggers it.',
    );

  if (lowered.errors.length) throw new Error(lowered.errors[0].message);

  return { code: lowered.code, map: lowered.map ? JSON.stringify(lowered.map) : null };
}
