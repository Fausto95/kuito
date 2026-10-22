import {
  bindings,
  child,
  childNodes,
  children,
  freeNames,
  isFunctionNode,
  isReferencePosition,
  nameOf,
  TS_EXPRESSIONS,
  walk,
  type AstNode,
} from '../ast.ts';
import type { Edit } from '../edits.ts';
import type { ParsedModule } from '../parse.ts';
import { isCallbackAttribute } from '../../protocol/attributes.ts';
import { KINDS } from '../../protocol/manifest.ts';
import { calleeName, isUIFunctionAttribute, motionNames, type Candidate } from './candidates.ts';
import type { Placed } from './index.ts';
import { kuitoImports } from './kuito-imports.ts';

/** The views the kernel binds props of; any other element is a component, which reads them. */
const PRIMITIVES = new Set(
  Object.entries(KINDS).flatMap(([kind, spec]) => (spec.primitive ? [kind] : [])),
);

/** Views whose children are their label, which the UI thread can compute. */
const LABELS = new Set(['Text', 'Button']);

/** Props the kernel reads as data or identity on the JS thread rather than binding them. */
const UNBOUND = new Set([
  'class',
  'style',
  'key',
  'ref',
  'id',
  'gestures',
  'animate',
  'transition',
  'enter',
  'exit',
  'layout',
  'format',
]);

/** Rejections that keep code on the JS thread by what it does, not by how it is written. */
const BY_NATURE = new Set(['creates JSX', 'is async', 'is a generator', 'imports a module']);

interface Signals {
  root: AstNode;
  file: string;
  locate: ParsedModule['locate'];
  candidates: readonly Candidate[];
  outcomes: ReadonlyMap<Candidate, string | undefined>;
}

/** How one read or write of a signal can run: on the UI thread, not until a rejection is fixed, or on the JS thread. */
type Use = { thread: 'ui' } | { thread: 'blocked'; reason: string } | { thread: 'js' };

const UI: Use = { thread: 'ui' };
const JS: Use = { thread: 'js' };

/**
 * Signals a component can keep on the UI thread (docs/placement.md): a
 * component whose signals are read only in props the kernel binds and in
 * handlers the compiler placed, whose handlers create no JSX, is placed
 * whole. Each of its signals becomes a motion value, so the UI thread owns
 * it and the JS thread reads a mirror, and each computed of them and of
 * motion values becomes a value derived from them. Returns the edits that
 * make them, the names they are bound to, and the report's lines: one per
 * component that has a placeable signal or computed, and one per placed
 * computed or computed that keeps its component on the JS thread.
 */
export function uiSignals({ root, file, locate, candidates, outcomes }: Signals) {
  const edits: Edit[] = [];
  const names = new Set<string>();
  const placement: Placed[] = [];
  const makers = kuitoImports(root, file, 'signal');
  const computers = kuitoImports(root, file, 'computed');
  const motions = motionNames(root);

  if (!makers.size && !computers.size) return { edits, names, placement };

  for (const component of components(root)) {
    const declared = signalDeclarations(component.node, makers);
    const derived = computedDeclarations(component.node, computers, candidates);
    const own = new Set(declared.map(({ name }) => name));
    const { placeable, fallbacks } = settle(derived, new Set([...own, ...motions]), outcomes);
    const computing = [...placeable, ...fallbacks];

    if (!declared.length && !computing.length) continue;

    const local = bindings(component.node);
    const inside = candidates.filter(
      (candidate) =>
        candidate.node !== component.node &&
        candidate.node.start >= component.node.start &&
        candidate.node.end <= component.node.end,
    );
    const known = new Set([...own, ...motions, ...computing.map(({ name }) => name)]);
    const computes = new Set(computing.map(({ candidate }) => candidate));
    const handlers = handlerTest(component.node, inside);
    const handles = (candidate: Candidate) => handlers(candidate) || computes.has(candidate);
    let blocked: string | null = null;
    let js = false;

    for (const { name } of [...declared, ...computing]) {
      // Shadowed somewhere in the component: what a reference means is not worth guessing.
      if (local.filter((each) => each === name).length > 1) js = true;

      for (const reference of references(component.node, name)) {
        const use = useOf(reference, name, {
          inside,
          outcomes,
          known,
          handles,
          computes,
          writable: own.has(name),
        });

        if (use.thread === 'js') js = true;
        else if (use.thread === 'blocked') blocked ??= use.reason;
      }
    }

    if (js) continue;

    const at = { start: component.node.start, ...locate(component.node.start) };
    const site = 'component ' + component.name;
    const line = ({ name, call }: Computed) => ({
      site: 'computed ' + name,
      start: call.start,
      ...locate(call.start),
    });

    // Each computed holding the component back is reported where it is.
    if (fallbacks.length) {
      placement.push(...fallbacks.map((each) => ({ ...line(each), reason: each.reason })));

      continue;
    }

    if (blocked) {
      placement.push({ site, ...at, reason: blocked });

      continue;
    }

    placement.push({ site, ...at }, ...placeable.map(line));

    for (const { name, callee } of declared) {
      names.add(name);

      edits.push({
        op: 'overwrite',
        start: callee.start,
        end: callee.end,
        text: 'globalThis.__kuito.useMotion',
      });
    }

    for (const { name, callee } of placeable) {
      names.add(name);

      edits.push({
        op: 'overwrite',
        start: callee.start,
        end: callee.end,
        text: 'globalThis.__kuito.derive',
      });
    }
  }

  return { edits, names, placement };
}

/** `const name = computed(fn)` at the top of a component's body, and the compiled candidate of `fn`. */
interface Computed {
  name: string;
  call: AstNode;
  callee: AstNode;
  candidate: Candidate;
}

/**
 * Splits a component's computeds by where they can run, given the signals
 * and motion values the UI thread has (`inputs`): those it can run, and
 * those that read one of them but also something it cannot, with why. A
 * computed that reads none of them is the JS thread's, and in neither.
 */
function settle(
  derived: readonly Computed[],
  inputs: ReadonlySet<string>,
  outcomes: ReadonlyMap<Candidate, string | undefined>,
) {
  const rooted = grow(derived, inputs, (each, known) =>
    valueUses(each.candidate.node).some(({ name }) => name !== undefined && known.has(name)),
  );
  // A computed that reads one the UI thread cannot run cannot run there either.
  let placeable = rooted;

  for (;;) {
    const known = new Set([...inputs, ...placeable.map(({ name }) => name)]);
    const next = placeable.filter((each) => obstacle(each, known, outcomes) === undefined);

    if (next.length === placeable.length) break;

    placeable = next;
  }

  const known = new Set([...inputs, ...placeable.map(({ name }) => name)]);
  const fallbacks = rooted.flatMap((each) => {
    const reason = placeable.includes(each) ? undefined : obstacle(each, known, outcomes);

    return reason === undefined || BY_NATURE.has(reason) ? [] : [{ ...each, reason }];
  });

  return { placeable, fallbacks };
}

/** The computeds `test` admits, given `inputs` and those admitted so far, until no more are. */
function grow(
  derived: readonly Computed[],
  inputs: ReadonlySet<string>,
  test: (each: Computed, known: ReadonlySet<string>) => boolean,
): Computed[] {
  const known = new Set(inputs);
  let grew = true;

  while (grew) {
    grew = false;

    for (const each of derived)
      if (!known.has(each.name) && test(each, known)) {
        known.add(each.name);
        grew = true;
      }
  }

  return derived.filter(({ name }) => known.has(name));
}

/** Why a computed cannot run on the UI thread when it reads only `known` values there, phrased to follow "it". */
function obstacle(
  { candidate }: Computed,
  known: ReadonlySet<string>,
  outcomes: ReadonlyMap<Candidate, string | undefined>,
): string | undefined {
  const rejected = outcomes.get(candidate);

  if (rejected !== undefined) return rejected;

  const uses = valueUses(candidate.node);
  const written = uses.find(({ written }) => written);

  if (written) return `writes ${written.path}`;

  const effect = discardedCall(candidate.node);

  if (effect) return `calls ${effect} for its effect`;

  const elsewhere = uses.find(({ name }) => name === undefined || !known.has(name));

  return elsewhere && `reads ${elsewhere.path}, which only the JS thread has`;
}

/** The module's components: its top-level named functions. */
function components(root: AstNode): { name: string; node: AstNode }[] {
  return children(root, 'body').flatMap((statement) => {
    const declaration = statement.type.startsWith('Export')
      ? (child(statement, 'declaration') ?? statement)
      : statement;
    const name = nameOf(child(declaration, 'id'));

    if (declaration.type === 'FunctionDeclaration')
      return name ? [{ name, node: declaration }] : [];

    if (declaration.type !== 'VariableDeclaration') return [];

    return children(declaration, 'declarations').flatMap((each) => {
      const id = nameOf(child(each, 'id'));
      const init = child(each, 'init');

      return id && init && isFunctionNode(init) ? [{ name: id, node: init }] : [];
    });
  });
}

/** `const name = signal(literal)` statements at the top of a component's body. */
function signalDeclarations(component: AstNode, makers: ReadonlySet<string>) {
  const body = child(component, 'body');

  return (body?.type === 'BlockStatement' ? children(body, 'body') : []).flatMap((statement) => {
    if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const') return [];

    return children(statement, 'declarations').flatMap((declarator) => {
      const name = nameOf(child(declarator, 'id'));
      const init = child(declarator, 'init');
      const callee = init?.type === 'CallExpression' ? child(init, 'callee') : undefined;
      const args = init ? children(init, 'arguments') : [];

      if (!name || !callee || !makers.has(nameOf(callee) ?? '')) return [];

      // What becomes a motion value crosses to the UI thread as JSON from its first value.
      return args.length === 1 && isLiteralData(args[0]) ? [{ name, callee }] : [];
    });
  });
}

/** `const name = computed(fn)` statements at the top of a component's body whose `fn` the compiler considered. */
function computedDeclarations(
  component: AstNode,
  makers: ReadonlySet<string>,
  candidates: readonly Candidate[],
): Computed[] {
  const body = child(component, 'body');
  const local = bindings(component);

  return (body?.type === 'BlockStatement' ? children(body, 'body') : []).flatMap((statement) => {
    if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const') return [];

    return children(statement, 'declarations').flatMap((declarator) => {
      const name = nameOf(child(declarator, 'id'));
      const call = child(declarator, 'init');
      const callee = call?.type === 'CallExpression' ? child(call, 'callee') : undefined;
      const fn = call && children(call, 'arguments')[0];
      const candidate = fn && candidates.find(({ node }) => node === fn);

      if (!name || !call || !callee || !candidate || !makers.has(nameOf(callee) ?? '')) return [];

      // A local function of the same name is not Kuito's.
      if (local.includes(nameOf(callee) ?? '')) return [];

      return [{ name, call, callee, candidate }];
    });
  });
}

/** A literal that crosses as JSON: numbers, strings, booleans, null, and arrays and objects of them. */
function isLiteralData(node: AstNode | undefined): boolean {
  if (!node) return false;

  if (TS_EXPRESSIONS.has(node.type)) return isLiteralData(child(node, 'expression'));

  switch (node.type) {
    case 'Literal':
      return !('regex' in node && node.regex) && typeof node.value !== 'bigint';
    case 'TemplateLiteral':
      return children(node, 'expressions').length === 0;
    case 'UnaryExpression':
      return node.operator === '-' && child(node, 'argument')?.type === 'Literal';
    case 'ArrayExpression':
      return children(node, 'elements').every(isLiteralData);
    case 'ObjectExpression':
      return children(node, 'properties').every(
        (property) =>
          property.type === 'Property' &&
          !property.computed &&
          !property.method &&
          isLiteralData(child(property, 'value')),
      );
    default:
      return false;
  }
}

interface Reference {
  node: AstNode;
  /** Its ancestors, nearest last. */
  stack: AstNode[];
}

/** Every read of `name` under `root` but its declaration. */
function references(root: AstNode, name: string): Reference[] {
  const found: Reference[] = [];

  function visit(node: AstNode, stack: AstNode[], key: string) {
    const parent = stack[stack.length - 1];

    if (parent && !isReferencePosition(parent, key)) return;

    if (node.type === 'Identifier') {
      const declaring = parent?.type === 'VariableDeclarator' && key === 'id';

      if (node.name === name && !declaring) found.push({ node, stack });

      return;
    }

    for (const [childKey, item] of childNodes(node, { types: false }))
      visit(item, [...stack, node], childKey);
  }

  visit(root, [], '');

  return found;
}

type Handles = (candidate: Candidate) => boolean;

/** Whether the UI thread calls a function on an event: a handler, or a gesture's or animation's callback. */
const isHandler = (candidate: Candidate) =>
  candidate.kind === 'handler' || (candidate.kind === 'callback' && candidate.calledOnUI);

/**
 * Handlers, and the component's local functions that only handlers use:
 * given as a handler (`onPress={spin}`) or called from one.
 */
function handlerTest(component: AstNode, inside: readonly Candidate[]): Handles {
  const local = inside.filter(
    (candidate) => candidate.kind === 'function' && candidate.name !== undefined,
  );
  const handled = new Set(
    local.filter(({ name, node }) =>
      references(component, name ?? '').every(({ node: reference, stack }) => {
        const parent = stack[stack.length - 1];
        const attribute = stack[stack.length - 2];
        const given =
          parent?.type === 'JSXExpressionContainer' &&
          attribute?.type === 'JSXAttribute' &&
          child(attribute, 'name')?.type === 'JSXIdentifier' &&
          isUIFunctionAttribute(String(child(attribute, 'name')?.name));
        const called =
          parent?.type === 'CallExpression' &&
          child(parent, 'callee') === reference &&
          inside.some(
            (candidate) =>
              isHandler(candidate) &&
              candidate.node.start <= reference.start &&
              reference.end <= candidate.node.end,
          );

        return reference.start >= node.start && reference.end <= node.end ? false : given || called;
      }),
    ),
  );

  return (candidate) => isHandler(candidate) || handled.has(candidate);
}

/**
 * What runs `node`, of the functions the compiler considered inside the
 * component: the innermost handler around it (a gesture's callback inside
 * a `gestures` prop runs alone), else the outermost function.
 */
function enclosing(
  node: AstNode,
  inside: readonly Candidate[],
  handles: Handles,
): Candidate | undefined {
  const around = inside
    .filter((candidate) => candidate.node.start <= node.start && node.end <= candidate.node.end)
    .sort((a, b) => a.node.start - b.node.start || b.node.end - a.node.end);

  return around.findLast(handles) ?? around[0];
}

/** Whether a JSX expression is a prop the kernel binds, or a label's children. */
function isBoundProp({ kind, prop }: Candidate): boolean {
  if (kind !== 'expression' || !prop || !PRIMITIVES.has(prop.element)) return false;

  if (prop.name === 'children') return LABELS.has(prop.element);

  return !isCallbackAttribute(prop.name) && !UNBOUND.has(prop.name);
}

interface Context {
  inside: readonly Candidate[];
  outcomes: ReadonlyMap<Candidate, string | undefined>;
  /** The motion values, placeable signals and computeds the UI thread will have. */
  known: ReadonlySet<string>;
  handles: Handles;
  /** The computeds meant for the UI thread, whose reads `settle` already checked. */
  computes: ReadonlySet<Candidate>;
  /** Whether the name may be written: a signal, not a computed. */
  writable: boolean;
}

function useOf(
  { node, stack }: Reference,
  name: string,
  { inside, outcomes, known, handles, computes, writable }: Context,
): Use {
  const member = stack[stack.length - 1];
  const property = member && nameOf(child(member, 'property'));

  // Only `.value` reads and writes follow it; the signal itself goes wherever it is passed.
  if (member?.type !== 'MemberExpression' || member.computed || property !== 'value') return JS;

  const above = stack[stack.length - 2];
  const writes =
    (above?.type === 'AssignmentExpression' && child(above, 'left') === member) ||
    above?.type === 'UpdateExpression';
  const candidate = enclosing(node, inside, handles);

  if (!candidate || (writes && !writable)) return JS;

  const reason = outcomes.get(candidate);
  const handler = handles(candidate);

  if (!(handler || (isBoundProp(candidate) && !writes))) return JS;

  if (reason !== undefined)
    return BY_NATURE.has(reason)
      ? JS
      : {
          thread: 'blocked',
          reason: `has signal ${name} read by ${candidate.site}, which ${reason}`,
        };

  // A handler sees a JS-thread value as it was when it was sent: one that
  // reads one must run where that value is current.
  return handler && !computes.has(candidate) && readsElsewhere(candidate.node, known) ? JS : UI;
}

interface ValueUse {
  /** The name whose `.value` it uses, when that is a plain name. */
  name?: string;
  /** What it uses, as the report names it: `count.value`, `props.step.value`. */
  path: string;
  /** Whether it assigns or updates it. */
  written: boolean;
}

/** The name a member chain starts from: `props` for `props.step.value`. */
function rootName(node: AstNode | undefined): string | undefined {
  while (node?.type === 'MemberExpression') node = child(node, 'object');

  return nameOf(node);
}

/**
 * Every `.value` that `fn` reads or writes of what it captures. One of its
 * own data (`options.find((option) => option.value === …)`) is no signal.
 */
function valueUses(fn: AstNode): ValueUse[] {
  const found: ValueUse[] = [];
  const free = freeNames(fn);

  walk(fn, (node, parent) => {
    if (
      node.type !== 'MemberExpression' ||
      node.computed ||
      nameOf(child(node, 'property')) !== 'value'
    )
      return;

    const object = child(node, 'object');
    const root = rootName(object);

    if (root !== undefined && !free.has(root)) return;

    found.push({
      ...(object?.type === 'Identifier' && { name: String(object.name) }),
      path: calleeName(node) ?? 'a .value',
      written:
        (parent?.type === 'AssignmentExpression' && child(parent, 'left') === node) ||
        parent?.type === 'UpdateExpression',
    });
  });

  return found;
}

/** The first call in `fn` whose result nothing uses, as the report names its callee. */
function discardedCall(fn: AstNode): string | undefined {
  let found: string | undefined;

  walk(fn, (node) => {
    const unused =
      node.type === 'ExpressionStatement'
        ? [child(node, 'expression')]
        : node.type === 'SequenceExpression'
          ? children(node, 'expressions').slice(0, -1)
          : [];

    for (const expression of unused) {
      const call =
        expression?.type === 'ChainExpression' ? child(expression, 'expression') : expression;

      if (call?.type === 'CallExpression')
        found ??= calleeName(child(call, 'callee')) ?? 'a function';
    }
  });

  return found;
}

/** Whether `fn` reads `.value` of anything but the motion values and signals in `known`. */
function readsElsewhere(fn: AstNode, known: ReadonlySet<string>): boolean {
  let found = false;

  function visit(node: AstNode, parent: AstNode | undefined) {
    if (found) return;

    if (
      node.type === 'MemberExpression' &&
      !node.computed &&
      nameOf(child(node, 'property')) === 'value'
    ) {
      const object = child(node, 'object');
      const assigned =
        parent?.type === 'AssignmentExpression' &&
        parent.operator === '=' &&
        child(parent, 'left') === node;

      if (!assigned && !(object?.type === 'Identifier' && known.has(String(object.name))))
        found = true;
    }

    for (const [, item] of childNodes(node, { types: false })) visit(item, node);
  }

  visit(fn, undefined);

  return found;
}
