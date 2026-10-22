import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import type MagicString from 'magic-string';
import {
  boundAnywhere,
  child,
  children,
  fingerprint,
  freeNames,
  nameOf,
  type AstNode,
} from '../ast.ts';
import type { Edit } from '../edits.ts';
import { isPackageSpecifier, type ParsedModule } from '../parse.ts';
import {
  findCandidates,
  moduleFunctionStatements,
  motionNames,
  type Candidate,
  type ThreadFunctionKind,
} from './candidates.ts';
import { captureRead, captures, type Occurrence, type ThreadCapture } from './captures.ts';
import { lowerUI, threadTag, uiDefinition, wrapEdits, type Wrapper } from './codegen.ts';
import { analyze, Rejection, type ModuleScope } from './scope.ts';
import { uiSignals } from './signals.ts';
import { isKuitoSource, KUITO_NAMESPACES, kuitoImports } from './kuito-imports.ts';

/**
 * Compiles functions for the UI thread, so app code never says where it runs.
 *
 * Every module function, JSX prop expression and event handler that only reads
 * captured values, writes `.value`, and calls other functions gets a copy in
 * the UI bundle, registered by id. The JS-thread function is tagged with that
 * id, a lazy capture list and each capture's path and uses; the kernel decides
 * at runtime which copy runs.
 * Functions that can never run on the UI thread are tagged with the reason.
 *
 * The scheme follows Octane's thread functions (https://github.com/octanejs/octane,
 * packages/octane/src/compiler/compile-universal.js, MIT License, Copyright (c)
 * 2026 Dominic Gannaway): code ships in a second bundle rather than as strings
 * evaluated per function, and captures are a lazy list taken at the call site.
 */

export interface ThreadFunction {
  id: string;
  kind: ThreadFunctionKind;
  name?: string;
  line: number;
  column: number;
  captures: ThreadCapture[];
}

/**
 * One line of the placement report (docs/placement.md): code whose inputs or
 * outputs live on the UI thread, and where it runs.
 */
export interface Placement {
  /** `Box translateX`, `Box onPress`, `tap onEnd`, `fade`. */
  site: string;
  line: number;
  column: number;
  /** Why it runs on the JS thread instead, phrased to follow "it"; absent when placed. */
  reason?: string;
}

/** A report line and where its code starts, for source order. */
export type Placed = Placement & { start: number };

export interface RejectedFunction {
  kind: ThreadFunctionKind;
  name?: string;
  line: number;
  column: number;
  reason: string;
}

/** Local names the module imports from packages, and the package each comes from. */
function packageImports(root: AstNode): Map<string, string> {
  const found = new Map<string, string>();

  for (const statement of children(root, 'body')) {
    const from = child(statement, 'source')?.value;

    if (statement.type !== 'ImportDeclaration' || typeof from !== 'string') continue;
    if (!isPackageSpecifier(from)) continue;

    for (const specifier of children(statement, 'specifiers')) {
      const local = nameOf(child(specifier, 'local'));

      if (local) found.set(local, from);
    }
  }

  return found;
}

/**
 * Local names bound to a module namespace: `import * as x`, a capability of
 * `kuito` (`import { haptics } from 'kuito'`), and the default of a native
 * module's spec, whose functions it holds.
 */
function namespaceImports(root: AstNode, file: string, isSpec: (path: string) => boolean) {
  const found = new Set<string>();

  for (const statement of children(root, 'body')) {
    const from = child(statement, 'source')?.value;

    if (statement.type !== 'ImportDeclaration' || typeof from !== 'string') continue;

    const path = /^[./]/.test(from) ? resolve(dirname(file), from) : null;
    const kuito = isKuitoSource(from, file);
    const spec = path !== null && (isSpec(path) || isSpec(path + '.ts'));

    for (const specifier of children(statement, 'specifiers')) {
      const local = nameOf(child(specifier, 'local'));
      const imported = nameOf(child(specifier, 'imported'));
      const namespace =
        specifier.type === 'ImportNamespaceSpecifier' ||
        (specifier.type === 'ImportDefaultSpecifier' && spec) ||
        (specifier.type === 'ImportSpecifier' && kuito && KUITO_NAMESPACES.has(imported ?? ''));

      if (local && namespace) found.add(local);
    }
  }

  return found;
}

/**
 * What the report lists, in source order: what touches a motion value (or a
 * signal placed on the UI thread), and what the UI thread calls anyway. A
 * function inside a placed one is part of it.
 */
function report(
  candidates: readonly Candidate[],
  outcomes: ReadonlyMap<Candidate, string | undefined>,
  root: AstNode,
  signals: ReadonlySet<string>,
  locate: ParsedModule['locate'],
): Placed[] {
  const motions = new Set([...motionNames(root), ...signals]);
  const placement: Placed[] = [];
  let placedEnd = -1;

  for (const candidate of candidates) {
    const { node, site, kind, calledOnUI } = candidate;
    const reason = outcomes.get(candidate);
    const touches = [...freeNames(node)].some((name) => motions.has(name));

    // A UI prop's function (a field's format) runs on its own, placed or not.
    const standalone = kind === 'handler' && calledOnUI;

    if (site === null || (!reason && node.start < placedEnd)) continue;
    if (!touches && !standalone && (reason || !calledOnUI)) continue;
    // A component renders on the JS thread by design.
    if (kind === 'function' && reason === 'creates JSX') continue;

    placement.push({ site, start: node.start, ...locate(node.start), ...(reason && { reason }) });

    if (!reason) placedEnd = Math.max(placedEnd, node.end);
  }

  return placement;
}

/**
 * Where a module function wrapped into a `var` moves to, as its declaration
 * was hoisted: after the imports, which run first anyway, so their lines stay
 * where an error at one points.
 */
function hoistedTo(root: AstNode): number {
  const body = children(root, 'body');

  // Every expression statement has a `directive` key; only a directive's is a string.
  const isDirective = (statement: AstNode) =>
    typeof Reflect.get(statement, 'directive') === 'string';

  return (
    body.find((statement) => !isDirective(statement) && statement.type !== 'ImportDeclaration')
      ?.start ?? root.end
  );
}

/** A module function an earlier pass wraps in a pure call: a component's registration. */
export interface OuterWrapper {
  name: string;
  /** A function declaration, rather than a `const`'s function. */
  declaration: boolean;
  wrapper: Wrapper;
}

/**
 * The edits that wrap each of `outer`'s functions, with no thread tag of
 * their own: for a module the thread pass does not compile.
 */
export function outerWrapEdits(
  { source, root, comments }: ParsedModule,
  outer: ReadonlyMap<AstNode, OuterWrapper>,
): Edit[] {
  const moduleFunctions = moduleFunctionStatements(root, source, comments);
  const moduleStart = hoistedTo(root);

  return [...outer].flatMap(([node, { name, declaration, wrapper }]) =>
    wrapEdits(
      { node, name, kind: 'function', declaration },
      moduleFunctions.get(node),
      moduleStart,
      [wrapper],
    ),
  );
}

interface Earlier {
  /** The JSX expressions the component pass made lazy. */
  expressions: readonly AstNode[];
  /** Module functions an earlier pass wraps, outside any thread tag. */
  outer?: ReadonlyMap<AstNode, OuterWrapper>;
  /** The edits of the passes before this one, which UI copies keep. */
  edits: readonly Edit[];
  /** Whether a file is a native module's spec. */
  isSpec?: (path: string) => boolean;
}

export function threadPass(
  { id: filename, file, source, root, comments, locate }: ParsedModule,
  { expressions, edits: earlier, outer = new Map(), isSpec = () => false }: Earlier,
) {
  const edits: Edit[] = [];
  const functions: ThreadFunction[] = [];
  const rejected: RejectedFunction[] = [];
  const ui: MagicString[] = [];
  const moduleFunctions = moduleFunctionStatements(root, source, comments);
  const moduleStart = hoistedTo(root);
  // What an earlier pass replaced reads nothing: a `styles()` call is its classes.
  const replaced = new Set(
    earlier.flatMap((edit) => (edit.op === 'overwrite' ? [`${edit.start}:${edit.end}`] : [])),
  );
  const scope: ModuleScope = {
    declared: boundAnywhere(root),
    packages: packageImports(root),
    namespaces: namespaceImports(root, filename, isSpec),
    opaque: (node) => replaced.has(`${node.start}:${node.end}`),
  };
  const defined = new Set<string>();
  const candidates = findCandidates(root, expressions, kuitoImports(root, filename, 'computed'));
  /** Each candidate's outcome: why it was rejected, or undefined once compiled. */
  const outcomes = new Map<Candidate, string | undefined>();
  let eligibleEnd = -1;

  /** Each tagged function's thread tag, wrapped with its outer wrapper when it has one. */
  const tagged = new Map<AstNode, { candidate: Candidate; wrapper: Wrapper }>();

  for (const candidate of candidates) {
    const { node, kind, name } = candidate;
    const tag = (fn: string, rest: string) =>
      tagged.set(node, { candidate, wrapper: threadTag(fn, rest) });

    // The enclosing UI copy already contains this function. A callback is
    // tagged anyway: run on the JS thread, the enclosing function creates it there.
    if (node.start < eligibleEnd && kind !== 'callback') {
      outcomes.set(candidate, undefined);

      continue;
    }

    const at = locate(node.start);
    let occurrences: Occurrence[];

    try {
      occurrences = analyze(node, kind === 'function' ? name : undefined, scope);
    } catch (error) {
      if (!(error instanceof Rejection)) throw error;

      const reason = error.message;

      rejected.push({ kind, ...(name && { name }), ...at, reason });
      outcomes.set(candidate, reason);

      // A component never runs on the UI thread; its tag would only cost bytes.
      if (reason === 'creates JSX') continue;

      tag('__kuitoThreadRejected', JSON.stringify(`${reason} (${file}:${at.line}:${at.column})`));

      continue;
    }

    outcomes.set(candidate, undefined);

    const list = captures(occurrences);
    // By content, not position: an edit elsewhere in the file, or one that
    // only moves or reformats this function, keeps its id, so the UI thread
    // keeps what it bound to it across the revision.
    const id =
      'tf_' +
      createHash('sha256')
        .update([file, kind, name ?? '', fingerprint(node)].join('\0'))
        .digest('hex')
        .slice(0, 16);

    functions.push({ id, kind, ...(name && { name }), ...at, captures: list });

    const uses = JSON.stringify(list.map((item) => [item.path, ...item.uses]));
    const reads = list.map((item) => captureRead(item.path, occurrences));

    tag('__kuitoThread', `${JSON.stringify(id)}, () => [${reads.join(', ')}], ${uses}`);

    // Two functions alike in everything are one UI function.
    if (!defined.has(id))
      ui.push(
        uiDefinition(
          id,
          source,
          candidate,
          occurrences,
          list,
          earlier,
          `${file}:${at.line}:${at.column}`,
        ),
      );

    defined.add(id);
    eligibleEnd = Math.max(eligibleEnd, node.end);
  }

  for (const [node, { candidate, wrapper }] of tagged) {
    const around = outer.get(node);

    edits.push(
      ...wrapEdits(candidate, moduleFunctions.get(node), moduleStart, [
        ...(around ? [around.wrapper] : []),
        wrapper,
      ]),
    );
  }

  for (const [node, { name, declaration, wrapper }] of outer)
    if (!tagged.has(node))
      edits.push(
        ...wrapEdits(
          { node, name, kind: 'function', declaration },
          moduleFunctions.get(node),
          moduleStart,
          [wrapper],
        ),
      );

  const signals = uiSignals({ root, file: filename, locate, candidates, outcomes });

  edits.push(...signals.edits);

  const lowered = lowerUI(filename, ui);

  return {
    edits,
    ui: lowered.code,
    uiMap: lowered.map,
    functions,
    rejected,
    placement: [...signals.placement, ...report(candidates, outcomes, root, signals.names, locate)]
      .sort((a, b) => a.start - b.start)
      .map(({ start: _start, ...entry }) => entry),
  };
}
