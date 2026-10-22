import {
  blockScopeNames,
  child,
  children,
  functionScopeNames,
  isAstNode,
  isBindingPosition,
  isBlockScope,
  isFunctionNode,
  isReferencePosition,
  nameOf,
  TS_EXPRESSIONS,
  type AstNode,
} from '../ast.ts';
import type { CaptureUse, Occurrence } from './captures.ts';

/** Globals every Hermes runtime has; the UI thread provides `console`. */
const GLOBALS = new Set([
  'undefined',
  'NaN',
  'Infinity',
  'Math',
  'Number',
  'String',
  'Boolean',
  'Array',
  'Object',
  'JSON',
  'Date',
  'Error',
  'TypeError',
  'RangeError',
  'Map',
  'Set',
  'Symbol',
  'isFinite',
  'isNaN',
  'parseFloat',
  'parseInt',
  'console',
]);

const CONSTRUCTIBLE = new Set([
  'Date',
  'Error',
  'TypeError',
  'RangeError',
  'Map',
  'Set',
  'Array',
  'Object',
]);

const KEYS_SKIPPED = new Set([
  'type',
  'start',
  'end',
  'range',
  'loc',
  'typeAnnotation',
  'returnType',
  'typeParameters',
  'typeArguments',
  'decorators',
]);

/** Why a function cannot run on the UI thread, phrased to follow "it". */
export class Rejection extends Error {}

/** How the expression at `node` (the outermost node of a captured path) is used. */
function useOf(
  node: AstNode,
  parent: AstNode | undefined,
  grandparent: AstNode | undefined,
): CaptureUse {
  if (parent?.type === 'CallExpression' && parent.callee === node)
    return grandparent?.type === 'ExpressionStatement' ? 'call' : 'callResult';

  return 'read';
}

function isAssignedTo(node: AstNode, parent: AstNode | undefined): boolean {
  return (
    (parent?.type === 'AssignmentExpression' && parent.left === node) ||
    (parent?.type === 'UpdateExpression' && parent.argument === node) ||
    (parent?.type === 'UnaryExpression' && parent.operator === 'delete' && parent.argument === node)
  );
}

function isDestructuringTarget(parent: AstNode, key: string, node: AstNode): boolean {
  const target =
    (parent.type === 'AssignmentExpression' && key === 'left') ||
    ((parent.type === 'ForInStatement' || parent.type === 'ForOfStatement') && key === 'left');

  return target && node.type !== 'MemberExpression' && node.type !== 'VariableDeclaration';
}

/** What the module around a function binds, which decides what its captures can be. */
export interface ModuleScope {
  /** Every name bound anywhere in the module. */
  declared: ReadonlySet<string>;
  /** Names imported from packages, by local name: the specifier. */
  packages: ReadonlyMap<string, string>;
  /**
   * Names bound to a module namespace: a member called on one is a binding
   * of its own, not a method that needs the namespace as `this`.
   */
  namespaces: ReadonlySet<string>;
  /** Nodes an earlier pass replaced, which read nothing. */
  opaque: (node: AstNode) => boolean;
}

/**
 * Free variables of `fn`, as capture occurrences. Throws a Rejection for
 * anything the UI thread cannot run.
 */
export function analyze(
  fn: AstNode,
  ownName: string | undefined,
  module: ModuleScope,
): Occurrence[] {
  if (fn.async) throw new Rejection('is async');
  if (fn.generator) throw new Rejection('is a generator');

  const occurrences: Occurrence[] = [];
  const scopes: Set<string>[] = [];
  const declared = (name: string) => scopes.some((scope) => scope.has(name));

  function capture(node: AstNode, stack: AstNode[]) {
    const root = String(node.name);
    const optional: boolean[] = [];
    let outer = node;
    let path = root;
    let depth = stack.length - 1;

    // Extend `a.b.c` while the next segment is a plain member read, stopping
    // before `.value` (motion values and signals cross as themselves) and
    // before a method name (the receiver crosses, so `this` survives), except
    // a namespace's: its members cross one by one, so the bundler drops the rest.
    while (depth >= 0) {
      const parent = stack[depth];

      if (parent.type !== 'MemberExpression' || parent.object !== outer || parent.computed) break;

      const property = nameOf(child(parent, 'property'));
      const above = stack[depth - 1];

      if (!property || property === 'value') break;

      if (above?.type === 'CallExpression' && above.callee === parent && outer !== node) break;

      if (
        above?.type === 'CallExpression' &&
        above.callee === parent &&
        !module.namespaces.has(root)
      )
        break;

      outer = parent;
      path += '.' + property;
      optional.push(!!parent.optional);
      depth--;
    }

    const parent = stack[depth];
    const grandparent = stack[depth - 1];
    const occur = (use: CaptureUse, callee = path) => {
      const from = module.packages.get(root);

      // A package is never compiled for the UI thread, so its result never is either.
      if (use === 'callResult' && from)
        throw new Rejection(`uses the result of ${callee}, a JS-thread function from ${from}`);

      occurrences.push({ path, optional, start: outer.start, end: outer.end, use });
    };

    // The thunk would throw a ReferenceError where `typeof` does not.
    if (
      outer === node &&
      parent?.type === 'UnaryExpression' &&
      parent.operator === 'typeof' &&
      !module.declared.has(root)
    )
      throw new Rejection(`reads typeof ${root}, which nothing declares`);

    if (outer === node && isAssignedTo(node, parent))
      throw new Rejection(`assigns ${root}, a JS-thread variable`);

    if (parent?.type === 'MemberExpression' && parent.object === outer) {
      const property = nameOf(child(parent, 'property'));
      const above = stack[depth - 1];

      if (property === 'value' && !parent.computed) {
        if (isAssignedTo(parent, above)) {
          if (above?.type === 'UpdateExpression' || above?.operator !== '=') occur('read');

          occur('write');

          return;
        }
      } else if (isAssignedTo(parent, above)) {
        const member = parent.computed ? '[…]' : '.' + (property ?? '');

        throw new Rejection(`assigns ${path}${member}, a JS-thread object`);
      }

      if (above?.type === 'CallExpression' && above.callee === parent) {
        occur(useOf(parent, above, stack[depth - 2]), `${path}.${property ?? '[…]'}`);

        return;
      }
    } else if (outer !== node && isAssignedTo(outer, parent)) {
      throw new Rejection(`assigns ${path}, a JS-thread object`);
    }

    occur(useOf(outer, parent, grandparent));
  }

  function walk(node: AstNode, stack: AstNode[]) {
    if (module.opaque(node)) return;

    switch (node.type) {
      case 'ThisExpression':
      case 'Super':
        throw new Rejection('uses this');
      case 'AwaitExpression':
        throw new Rejection('is async');
      case 'YieldExpression':
        throw new Rejection('is a generator');
      case 'JSXElement':
      case 'JSXFragment':
        throw new Rejection('creates JSX');
      case 'ClassDeclaration':
      case 'ClassExpression':
        throw new Rejection('declares a class');
      case 'ImportExpression':
        throw new Rejection('imports a module');
      case 'MetaProperty':
        throw new Rejection(
          `uses ${nameOf(child(node, 'meta')) ?? ''}.${nameOf(child(node, 'property')) ?? ''}`,
        );
      case 'NewExpression': {
        const callee = nameOf(child(node, 'callee'));

        if (!callee || !CONSTRUCTIBLE.has(callee) || declared(callee))
          throw new Rejection('constructs ' + (callee ?? 'an object'));

        break;
      }
      case 'Identifier': {
        const name = String(node.name);

        if (name === 'arguments' && !declared(name)) throw new Rejection('uses arguments');
        if (name === 'eval') throw new Rejection('calls eval');
        if (name === '__kuitoJSX' || name === '__kuitoExpr') throw new Rejection('creates JSX');

        if (!declared(name) && name !== ownName && !GLOBALS.has(name)) capture(node, stack);

        return;
      }
    }

    if (TS_EXPRESSIONS.has(node.type)) {
      const expression = child(node, 'expression');

      if (expression) walk(expression, [...stack, node]);

      return;
    }

    if (node.type.startsWith('TS')) return;

    const names = isFunctionNode(node)
      ? functionScopeNames(node)
      : isBlockScope(node)
        ? blockScopeNames(node)
        : null;

    if (names) scopes.push(new Set(names));

    const next = [...stack, node];

    for (const [key, value] of Object.entries(node)) {
      if (KEYS_SKIPPED.has(key) || !isReferencePosition(node, key)) continue;

      for (const item of Array.isArray(value) ? value : [value])
        if (isAstNode(item)) walkPosition(node, key, item, next);
    }

    if (names) scopes.pop();
  }

  /** Binding patterns are walked for their defaults and computed keys only. */
  function walkPosition(parent: AstNode, key: string, node: AstNode, stack: AstNode[]) {
    if (isBindingPosition(parent, key)) walkPattern(node, stack, false);
    else if (isDestructuringTarget(parent, key, node)) walkPattern(node, stack, true);
    else walk(node, stack);
  }

  /** A binding pattern declares names; a destructuring target assigns them. */
  function walkPattern(node: AstNode, stack: AstNode[], assigning: boolean) {
    const next = [...stack, node];
    const pattern = (item: AstNode | undefined) => {
      if (item) walkPattern(item, next, assigning);
    };

    switch (node.type) {
      case 'Identifier':
        if (assigning && !declared(String(node.name)))
          throw new Rejection(`assigns ${String(node.name)}, a JS-thread variable`);

        return;
      case 'AssignmentPattern':
        pattern(child(node, 'left'));
        walk(child(node, 'right') ?? node, next);

        return;
      case 'ObjectPattern':
        for (const property of children(node, 'properties')) {
          const key = child(property, 'key');

          if (property.computed && key) walk(key, next);
          pattern(child(property, property.type === 'RestElement' ? 'argument' : 'value'));
        }

        return;
      case 'ArrayPattern':
        for (const element of children(node, 'elements')) pattern(element);
        return;
      case 'RestElement':
        pattern(child(node, 'argument'));
        return;
      default:
        // A member target: `[a.b] = pair` writes a JS-thread object unless declared.
        walk(node, stack);
    }
  }

  scopes.push(new Set(functionScopeNames(fn)));

  for (const [key, value] of Object.entries(fn)) {
    if (KEYS_SKIPPED.has(key) || key === 'id') continue;

    for (const item of Array.isArray(value) ? value : [value])
      if (isAstNode(item)) walkPosition(fn, key, item, [fn]);
  }

  return occurrences;
}
