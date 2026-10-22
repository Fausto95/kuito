import type { Comment } from 'oxc-parser';
import { child, children, isFunctionNode, nameOf, walk, type AstNode } from '../ast.ts';
import { isCallbackAttribute } from '../../protocol/attributes.ts';
import { PAYLOADS } from '../../protocol/manifest.ts';
import { isKuitoModule } from '../parse.ts';

/** A module or local function, a JSX prop expression, a JSX on* handler, or an on* callback. */
export type ThreadFunctionKind = 'function' | 'expression' | 'handler' | 'callback';

export interface Candidate {
  /** The function; for an expression, an arrow made up around it, `() => (expression)`. */
  node: AstNode;
  kind: ThreadFunctionKind;
  name?: string;
  /** A declaration is tagged by a statement after it; an expression is wrapped. */
  declaration: boolean;
  /**
   * What the placement report calls it: `Box translateX`, `tap onEnd`,
   * `x.map`. Null for what the kernel reads on the JS thread by design.
   */
  site: string | null;
  /** The UI thread calls it by construction: a gesture's or an animation's callback, a map. */
  calledOnUI: boolean;
  /** For a JSX expression or handler: the element it is given to and the prop, or `children`. */
  prop?: JsxProp;
}

export interface JsxProp {
  element: string;
  name: string;
}

/** The builders whose callbacks the UI thread calls: gestures and animations (docs/motion.md). */
const UI_BUILDERS = new Set([
  'pan',
  'tap',
  'longPress',
  'pinch',
  'rotate',
  'fling',
  'touches',
  'timing',
  'spring',
  'decay',
  'repeat',
  'keyframes',
]);

/**
 * Props whose function the UI thread calls on an event of the view, rather
 * than the view's handler: a field's `format` answers its edits.
 */
const UI_PROPS = new Set(['format']);

/** Whether a JSX attribute takes a function the UI thread calls: a handler, or a UI prop. */
export const isUIFunctionAttribute = (name: string) =>
  isCallbackAttribute(name) || UI_PROPS.has(name);

/**
 * Props the kernel turns into data on the JS thread, never bound on the UI
 * thread: what they describe runs there (docs/motion.md).
 */
const DESCRIBED_PROPS = new Set(['gestures', 'animate', 'transition', 'enter', 'exit', 'layout']);

/** A JSX element's name as written: `Box`, `Tabs.Screen`. */
function elementName(node: AstNode | undefined): string {
  if (node?.type === 'JSXIdentifier') return String(node.name);

  if (node?.type === 'JSXMemberExpression')
    return elementName(child(node, 'object')) + '.' + elementName(child(node, 'property'));

  if (node?.type === 'JSXNamespacedName')
    return elementName(child(node, 'namespace')) + ':' + elementName(child(node, 'name'));

  return 'element';
}

/** A callee as the report names it: `tap`, `drag.release`. */
export function calleeName(node: AstNode | undefined): string | undefined {
  if (node?.type === 'Identifier') return nameOf(node);

  if (node?.type !== 'MemberExpression' || node.computed) return undefined;

  const object = calleeName(child(node, 'object'));
  const property = nameOf(child(node, 'property'));

  return object && property ? object + '.' + property : property;
}

/**
 * Where each JSX expression sits, `Box translateX` or `Text children`, and
 * the call each object literal argument is given to.
 */
function sites(root: AstNode) {
  const props = new Map<AstNode, JsxProp>();
  const calls = new Map<AstNode, string>();

  walk(root, (node) => {
    if (node.type === 'JSXElement') {
      const opening = child(node, 'openingElement');
      const element = elementName(opening && child(opening, 'name'));

      for (const attribute of opening ? children(opening, 'attributes') : []) {
        const value = child(attribute, 'value');
        const expression = value && child(value, 'expression');
        const name = child(attribute, 'name');

        if (expression && name?.type === 'JSXIdentifier')
          props.set(expression, { element, name: String(name.name) });
      }

      for (const item of children(node, 'children')) {
        const expression = child(item, 'expression');

        if (item.type === 'JSXExpressionContainer' && expression)
          props.set(expression, { element, name: 'children' });
      }
    }

    if (node.type === 'CallExpression') {
      const callee = calleeName(child(node, 'callee'));

      for (const argument of children(node, 'arguments'))
        if (callee && argument.type === 'ObjectExpression') calls.set(argument, callee);
    }
  });

  return { props, calls };
}

/** The report's name for what a JSX expression is given to; null for the props the kernel reads as data. */
const siteOf = (prop: JsxProp | undefined) =>
  !prop ? 'expression' : DESCRIBED_PROPS.has(prop.name) ? null : prop.element + ' ' + prop.name;

/** `() => (expression)`, as the component pass writes it around a JSX expression. */
function arrowAround(expression: AstNode): AstNode {
  return {
    type: 'ArrowFunctionExpression',
    start: expression.start,
    end: expression.end,
    expression: true,
    async: false,
    generator: false,
    params: [],
    body: expression,
  };
}

/**
 * Every function the thread pass may compile for the UI thread, outermost
 * first: `expressions` are the JSX expressions the component pass made lazy,
 * `computeds` the local names of Kuito's `computed`.
 */
export function findCandidates(
  root: AstNode,
  expressions: readonly AstNode[],
  computeds: ReadonlySet<string>,
): Candidate[] {
  const at = sites(root);
  const found: Candidate[] = expressions.map((expression) => {
    const prop = at.props.get(expression);

    return {
      node: arrowAround(expression),
      kind: 'expression',
      declaration: false,
      site: siteOf(prop),
      calledOnUI: false,
      ...(prop && { prop }),
    };
  });
  const motions = motionNames(root);

  walk(root, (node, parent) => {
    const declared = nameOf(child(node, 'id'));

    if (node.type === 'FunctionDeclaration' && declared)
      found.push({
        node,
        kind: 'function',
        name: declared,
        declaration: true,
        site: declared,
        calledOnUI: false,
      });

    if (node.type === 'VariableDeclarator') {
      const init = child(node, 'init');

      if (declared && init && isFunctionNode(init))
        found.push({
          node: init,
          kind: 'function',
          name: declared,
          declaration: false,
          site: declared,
          calledOnUI: false,
        });
    }

    if (node.type === 'JSXExpressionContainer' && parent?.type === 'JSXAttribute') {
      const attribute = child(parent, 'name');
      const name = attribute?.type === 'JSXIdentifier' ? String(attribute.name) : '';
      const expression = child(node, 'expression');

      const prop = expression && at.props.get(expression);

      if (isUIFunctionAttribute(name) && expression && isFunctionNode(expression))
        found.push({
          node: expression,
          kind: 'handler',
          name,
          declaration: false,
          site: siteOf(prop) ?? name,
          calledOnUI: UI_PROPS.has(name),
          ...(prop && { prop }),
        });
    }

    // Callbacks named for an event, as Reanimated's plugin workletizes Gesture
    // Handler's: a gesture's { onChange: fn }, an animation's { onEnd: fn }.
    if (node.type === 'CallExpression') {
      const callee = child(node, 'callee');
      const method =
        callee?.type === 'MemberExpression' && !callee.computed
          ? nameOf(child(callee, 'property'))
          : undefined;

      // A motion value's map(fn) runs fn on the UI thread; an array's map does not.
      const mapsMotion =
        method === 'map' && callee !== undefined && isMotion(child(callee, 'object'), motions);

      // A declared computed's function: the UI thread runs it once the
      // computed is placed with its component (signals.ts).
      if (
        parent?.type === 'VariableDeclarator' &&
        callee?.type === 'Identifier' &&
        computeds.has(String(nameOf(callee)))
      ) {
        const fn = children(node, 'arguments')[0];

        if (fn && isFunctionNode(fn))
          found.push({
            node: fn,
            kind: 'callback',
            name: 'computed',
            declaration: false,
            site: null,
            calledOnUI: false,
          });
      }

      if (method && (isCallbackAttribute(method) || mapsMotion))
        for (const argument of children(node, 'arguments'))
          if (isFunctionNode(argument))
            found.push({
              node: argument,
              kind: 'callback',
              name: method,
              declaration: false,
              site: calleeName(callee) ?? method,
              calledOnUI: mapsMotion,
            });
    }

    if (node.type === 'Property' && !node.computed && !node.method) {
      const key = nameOf(child(node, 'key'));
      const value = child(node, 'value');
      const call = parent && at.calls.get(parent);

      if (key && isCallbackAttribute(key) && value && isFunctionNode(value))
        found.push({
          node: value,
          kind: 'callback',
          name: key,
          declaration: false,
          site: call ? call + ' ' + key : key,
          calledOnUI: call !== undefined && UI_BUILDERS.has(call),
        });
    }
  });

  return found.sort((a, b) => a.node.start - b.node.start || b.node.end - a.node.end);
}

/** Calls that make a motion value or a value derived from one. */
const MOTION_CALLS = ['motion', 'interpolate', 'clamp'];

/** Methods of a motion value that return one: `follows` itself, `map` a derived one. */
const MOTION_METHODS = ['follows', 'map'];

/** Kuito's namespaces whose members are motion values: `keyboard.height`. */
const KUITO_MOTIONS: Readonly<Record<string, readonly string[]>> = {
  keyboard: ['frame', 'height'],
};

/** Calls that make a motion source, and the motion values it holds (docs/motion.md#motion-sources). */
const SOURCE_CALLS: Readonly<Record<string, readonly string[]>> = {
  scrollMotion: Object.keys(PAYLOADS.ScrollMotionPayload),
  sheetMotion: Object.keys(PAYLOADS.SheetMotionPayload),
};

/** Whether `node` is a motion value or a derived one, as far as the module shows. */
function isMotion(node: AstNode | undefined, names: ReadonlySet<string>): boolean {
  if (!node) return false;

  if (node.type === 'Identifier') return names.has(String(nameOf(node)));

  // A source's field, `feed.offset`, is named with its source.
  if (node.type === 'MemberExpression' && !node.computed) {
    const object = child(node, 'object');

    return (
      object?.type === 'Identifier' &&
      names.has(nameOf(object) + '.' + nameOf(child(node, 'property')))
    );
  }

  if (node.type !== 'CallExpression') return false;

  const callee = child(node, 'callee');

  if (callee?.type === 'Identifier') return MOTION_CALLS.includes(String(nameOf(callee)));

  return (
    callee?.type === 'MemberExpression' &&
    MOTION_METHODS.includes(String(nameOf(child(callee, 'property')))) &&
    isMotion(child(callee, 'object'), names)
  );
}

/**
 * The names the module binds to motion values: `const x = motion(0).follows(drag.x)`,
 * and a source's fields with its name: `feed.offset` for `const feed = scrollMotion()`.
 */
export function motionNames(root: AstNode): Set<string> {
  const names = new Set<string>();
  let grew = true;

  for (const statement of children(root, 'body')) {
    const from = child(statement, 'source')?.value;

    if (statement.type !== 'ImportDeclaration' || typeof from !== 'string' || !isKuitoModule(from))
      continue;

    for (const specifier of children(statement, 'specifiers')) {
      const imported = nameOf(child(specifier, 'imported'));
      const local = nameOf(child(specifier, 'local'));

      if (imported && local && Object.hasOwn(KUITO_MOTIONS, imported))
        for (const member of KUITO_MOTIONS[imported]) names.add(local + '.' + member);
    }
  }

  walk(root, (node) => {
    if (node.type !== 'VariableDeclarator') return;

    const id = child(node, 'id');
    const init = child(node, 'init');
    const callee = init?.type === 'CallExpression' ? nameOf(child(init, 'callee')) : undefined;
    const fields = callee && Object.hasOwn(SOURCE_CALLS, callee) ? SOURCE_CALLS[callee] : null;

    if (!fields) return;

    const name = nameOf(id);

    if (name) for (const field of fields) names.add(name + '.' + field);

    // `const { offset } = scrollMotion()`: the field is a motion value of its own name.
    if (id?.type === 'ObjectPattern')
      for (const property of children(id, 'properties')) {
        const key = nameOf(child(property, 'key'));
        const local = nameOf(child(property, 'value'));

        if (property.type === 'Property' && key && fields.includes(key) && local) names.add(local);
      }
  });

  // A name bound to another name's map is found on a later pass.
  while (grew) {
    grew = false;

    walk(root, (node) => {
      const name = node.type === 'VariableDeclarator' ? nameOf(child(node, 'id')) : undefined;

      if (name && !names.has(name) && isMotion(child(node, 'init'), names)) {
        names.add(name);
        grew = true;
      }
    });
  }

  return names;
}

/** A module-level function declaration's statement and its overload signatures' statements. */
export interface ModuleFunction {
  statement: AstNode;
  signatures: AstNode[];
}

/**
 * Each module-level function declaration, with the statement that holds it and
 * those of the overload signatures before it.
 * A declaration annotated `@__NO_SIDE_EFFECTS__` stays where it is: the
 * annotation only applies to a declaration, and moving the function away from
 * it would keep every call the bundler could otherwise drop.
 */
export function moduleFunctionStatements(
  root: AstNode,
  source: string,
  comments: readonly Comment[],
): Map<AstNode, ModuleFunction> {
  const found = new Map<AstNode, ModuleFunction>();
  const annotated = (statement: AstNode) =>
    comments.some(
      ({ value, end }) =>
        /[@#]__NO_SIDE_EFFECTS__/.test(value) && !source.slice(end, statement.start).trim(),
    );
  let signatures: AstNode[] = [];
  let overloaded: string | undefined;

  for (const statement of children(root, 'body')) {
    const declaration = statement.type.startsWith('Export')
      ? child(statement, 'declaration')
      : statement;
    const name = declaration && nameOf(child(declaration, 'id'));

    // TypeScript requires a function's overload signatures right before its implementation.
    if (declaration?.type === 'TSDeclareFunction' && name) {
      if (name !== overloaded) signatures = [];

      signatures.push(statement);
      overloaded = name;

      continue;
    }

    if (declaration?.type === 'FunctionDeclaration' && !annotated(statement))
      found.set(declaration, { statement, signatures: name === overloaded ? signatures : [] });

    signatures = [];
    overloaded = undefined;
  }

  return found;
}
