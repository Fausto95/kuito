import { createHash } from 'node:crypto';

// The one ESTree walker Kuito's compiler passes, its plugins and its lint
// rules share. Oxc and Oxlint both produce ESTree; Oxlint adds `parent` links.

export interface AstNode {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

export const isAstNode = (value: unknown): value is AstNode =>
  typeof value === 'object' &&
  value !== null &&
  'type' in value &&
  typeof value.type === 'string' &&
  'start' in value &&
  typeof value.start === 'number';

/** Keys that never hold a child: positions, Oxlint's parent link and TypeScript-only parts. */
const NOT_CHILDREN = new Set(['type', 'start', 'end', 'range', 'loc', 'parent']);

const TYPE_ONLY = new Set([
  'typeAnnotation',
  'returnType',
  'typeParameters',
  'typeArguments',
  'decorators',
]);

export function child(node: AstNode, key: string): AstNode | undefined {
  const value = node[key];

  return isAstNode(value) ? value : undefined;
}

export function children(node: AstNode, key: string): AstNode[] {
  const value = node[key];

  return Array.isArray(value) ? value.filter(isAstNode) : [];
}

/** Every child node with the key that holds it, in source order of keys. */
export function childNodes(node: AstNode, { types = true } = {}): Array<[string, AstNode]> {
  const found: Array<[string, AstNode]> = [];

  for (const [key, value] of Object.entries(node)) {
    if (NOT_CHILDREN.has(key) || (!types && TYPE_ONLY.has(key))) continue;

    for (const item of Array.isArray(value) ? value : [value])
      if (isAstNode(item)) found.push([key, item]);
  }

  return found;
}

/**
 * Calls `visit` on `node` and every node under it, parents first. A visit
 * that returns false skips that node's children.
 */
export function walk(
  node: AstNode,
  visit: (node: AstNode, parent: AstNode | undefined, key: string) => boolean | void,
  parent?: AstNode,
  key = '',
): void {
  if (visit(node, parent, key) === false) return;

  for (const [childKey, item] of childNodes(node)) walk(item, visit, node, childKey);
}

export function nameOf(node: AstNode | undefined): string | undefined {
  return node?.type === 'Identifier' && typeof node.name === 'string' ? node.name : undefined;
}

export const isFunctionNode = (node: AstNode | undefined): boolean =>
  node?.type === 'FunctionDeclaration' ||
  node?.type === 'FunctionExpression' ||
  node?.type === 'ArrowFunctionExpression';

/** Names a pattern binds: `a`, `{ b, c: d }`, `[e, ...f]`, `g = 1`. */
export function patternNames(pattern: AstNode | undefined, names: string[] = []): string[] {
  if (!pattern) return names;

  switch (pattern.type) {
    case 'Identifier':
      names.push(String(pattern.name));
      break;
    case 'ObjectPattern':
      for (const property of children(pattern, 'properties'))
        patternNames(
          property.type === 'RestElement' ? child(property, 'argument') : child(property, 'value'),
          names,
        );

      break;
    case 'ArrayPattern':
      for (const element of children(pattern, 'elements')) patternNames(element, names);
      break;
    case 'AssignmentPattern':
      patternNames(child(pattern, 'left'), names);
      break;
    case 'RestElement':
      patternNames(child(pattern, 'argument'), names);
      break;
    case 'TSParameterProperty':
      patternNames(child(pattern, 'parameter'), names);
      break;
  }

  return names;
}

/** Declarations a block makes visible: let, const, class and function. */
export function blockNames(statements: AstNode[]): string[] {
  const names: string[] = [];

  for (const statement of statements) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? child(statement, 'declaration') : statement;

    if (declaration?.type === 'VariableDeclaration' && declaration.kind !== 'var')
      for (const declarator of children(declaration, 'declarations'))
        patternNames(child(declarator, 'id'), names);

    if (declaration?.type === 'FunctionDeclaration' || declaration?.type === 'ClassDeclaration') {
      const name = nameOf(child(declaration, 'id'));

      if (name) names.push(name);
    }
  }

  return names;
}

/** `var` declarations anywhere in a function body, outside nested functions. */
export function varNames(node: AstNode, names: string[] = []): string[] {
  if (node.type === 'VariableDeclaration' && node.kind === 'var')
    for (const declarator of children(node, 'declarations'))
      patternNames(child(declarator, 'id'), names);

  for (const [, item] of childNodes(node, { types: false }))
    if (!isFunctionNode(item)) varNames(item, names);

  return names;
}

/** The names a function makes visible inside itself: parameters, its own name, var and block declarations. */
export function functionScopeNames(node: AstNode): string[] {
  const names = children(node, 'params').flatMap((param) => patternNames(param));
  const id = nameOf(child(node, 'id'));

  if (id && node.type !== 'FunctionDeclaration') names.push(id);

  const body = child(node, 'body');

  if (body) varNames(body, names);
  if (body?.type === 'BlockStatement') names.push(...blockNames(children(body, 'body')));

  return names;
}

export function isBlockScope(node: AstNode): boolean {
  return (
    node.type === 'BlockStatement' ||
    node.type === 'ForStatement' ||
    node.type === 'ForInStatement' ||
    node.type === 'ForOfStatement' ||
    node.type === 'CatchClause' ||
    node.type === 'SwitchStatement'
  );
}

export function blockScopeNames(node: AstNode): string[] {
  switch (node.type) {
    case 'BlockStatement':
      return blockNames(children(node, 'body'));
    case 'SwitchStatement':
      return blockNames(children(node, 'cases').flatMap((item) => children(item, 'consequent')));
    case 'CatchClause':
      return patternNames(child(node, 'param'));
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement': {
      const head = child(node, node.type === 'ForStatement' ? 'init' : 'left');

      return head?.type === 'VariableDeclaration' ? blockNames([head]) : [];
    }
    default:
      return [];
  }
}

/** Child keys that hold names rather than references. */
export function isReferencePosition(node: AstNode, key: string): boolean {
  switch (node.type) {
    case 'MemberExpression':
      return key !== 'property' || !!node.computed;
    case 'Property':
    case 'PropertyDefinition':
    case 'MethodDefinition':
      return key !== 'key' || !!node.computed;
    case 'LabeledStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
      return key !== 'label';
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ClassDeclaration':
    case 'ClassExpression':
      return key !== 'id';
    case 'ImportDeclaration':
      return false;
    default:
      return true;
  }
}

export function isBindingPosition(node: AstNode, key: string): boolean {
  if (isFunctionNode(node)) return key === 'params';
  if (node.type === 'VariableDeclarator') return key === 'id';
  if (node.type === 'CatchClause') return key === 'param';

  return false;
}

/** Nodes that are TypeScript only; the expression wrappers among them hold runtime code. */
export const TS_EXPRESSIONS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression',
]);

/**
 * The names `root` reads that nothing inside it declares, resolved by scope:
 * property names, labels and binding patterns are not reads, and neither is a
 * JSX element name.
 */
export function freeNames(root: AstNode): Set<string> {
  const free = new Set<string>();
  const scopes: Set<string>[] = [];
  const declared = (name: string) => scopes.some((scope) => scope.has(name));

  function visit(node: AstNode) {
    if (node.type === 'Identifier') {
      if (!declared(String(node.name))) free.add(String(node.name));

      return;
    }

    if (node.type.startsWith('TS') && !TS_EXPRESSIONS.has(node.type)) return;

    const names = isFunctionNode(node)
      ? functionScopeNames(node)
      : isBlockScope(node)
        ? blockScopeNames(node)
        : null;

    if (names) scopes.push(new Set(names));

    for (const [key, item] of childNodes(node, { types: false })) {
      if (!isReferencePosition(node, key)) continue;

      if (isBindingPosition(node, key)) pattern(item);
      else visit(item);
    }

    if (names) scopes.pop();
  }

  /** A binding pattern reads only its defaults and computed keys. */
  function pattern(node: AstNode) {
    switch (node.type) {
      case 'Identifier':
        return;
      case 'AssignmentPattern':
        pattern(child(node, 'left') ?? node);
        visit(child(node, 'right') ?? node);

        return;
      case 'ObjectPattern':
        for (const property of children(node, 'properties')) {
          const key = child(property, 'key');

          if (property.computed && key) visit(key);

          const value = child(property, property.type === 'RestElement' ? 'argument' : 'value');

          if (value) pattern(value);
        }

        return;
      case 'ArrayPattern':
      case 'RestElement':
        for (const [, item] of childNodes(node, { types: false })) pattern(item);
        return;
      default:
        visit(node);
    }
  }

  visit(root);

  return free;
}

/** Every name the module binds anywhere: imports, declarations, parameters, catch clauses. */
export function boundAnywhere(program: AstNode): Set<string> {
  return new Set(bindings(program));
}

/** Each binding the module makes, a name once per place that binds it. */
export function bindings(program: AstNode): string[] {
  const names: string[] = [];

  walk(program, (node) => {
    if (node.type.startsWith('Import') && node.type.endsWith('Specifier'))
      names.push(...patternNames(child(node, 'local')));
    else if (node.type === 'VariableDeclarator') names.push(...patternNames(child(node, 'id')));
    else if (isFunctionNode(node) || node.type.startsWith('Class')) {
      const id = nameOf(child(node, 'id'));

      if (id) names.push(id);

      children(node, 'params').forEach((param) => names.push(...patternNames(param)));
    } else if (node.type === 'CatchClause') names.push(...patternNames(child(node, 'param')));
  });

  return names;
}

/** JSX text as JSX evaluates it: lines trimmed, blank lines dropped, joined by spaces. */
function jsxText(value: string): string {
  const lines = value.split(/\r\n|\n|\r/);

  if (lines.length === 1) return value;

  return lines
    .map((line, index) => {
      const head = index === 0 ? line : line.trimStart();

      return index === lines.length - 1 ? head : head.trimEnd();
    })
    .filter(Boolean)
    .join(' ');
}

function serialize(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    out.push('[');

    for (const item of value) {
      // JSX drops text that is only indentation between tags.
      if (isAstNode(item) && item.type === 'JSXText' && !jsxText(String(item.value))) continue;

      serialize(item, out);
      out.push(',');
    }

    out.push(']');

    return;
  }

  if (value === null || typeof value !== 'object') {
    out.push(typeof value === 'bigint' ? `${value}n` : String(JSON.stringify(value)));

    return;
  }

  const node = isAstNode(value) ? value : null;

  // Parentheses are formatting: `(a)` is `a`.
  if (node?.type === 'ParenthesizedExpression') return serialize(node.expression, out);

  out.push('{');

  for (const [key, item] of Object.entries(value)) {
    // `raw` is how a literal was written: `'a'` and `"a"` are one string.
    if (NOT_CHILDREN.has(key) && key !== 'type') continue;
    if (node && key === 'raw') continue;

    out.push(key, ':');

    if (node?.type === 'JSXText' && key === 'value') serialize(jsxText(String(item)), out);
    else serialize(item, out);

    out.push(',');
  }

  out.push('}');
}

/**
 * A hash of what `nodes` mean, not how they are laid out: positions,
 * comments, parentheses, quote styles and JSX indentation do not count.
 */
export function fingerprint(...nodes: unknown[]): string {
  const out: string[] = [];

  for (const node of nodes) {
    serialize(node, out);
    out.push('\0');
  }

  return createHash('sha256').update(out.join('')).digest('hex').slice(0, 16);
}

/** Offsets to 1-based lines and columns, through one table of line starts per source. */
export function lineTable(source: string): (offset: number) => { line: number; column: number } {
  const starts = [0];

  for (let index = source.indexOf('\n'); index !== -1; index = source.indexOf('\n', index + 1))
    starts.push(index + 1);

  return (offset) => {
    let low = 0;
    let high = starts.length - 1;

    while (low < high) {
      const middle = (low + high + 1) >> 1;

      if (starts[middle] <= offset) low = middle;
      else high = middle - 1;
    }

    return { line: low + 1, column: offset - starts[low] + 1 };
  };
}
