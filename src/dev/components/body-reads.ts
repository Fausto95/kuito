import { child, children, isFunctionNode, nameOf, walk, type AstNode } from '../ast.ts';
import type { Diagnostic } from '../compiler.ts';
import { isKuitoModule, type ParsedModule } from '../parse.ts';

/** The calls that make a signal: reading one's `.value` tracks it only where something re-runs. */
const SIGNAL_MAKERS = new Set(['signal', 'computed', 'motion']);

/** The local names bound to Kuito's signal makers; an unimported name is the global one. */
function makers(root: AstNode): (name: string) => boolean {
  const bound = new Map<string, boolean>();

  for (const statement of children(root, 'body')) {
    if (statement.type !== 'ImportDeclaration') continue;

    const source = child(statement, 'source');
    const kuito = typeof source?.value === 'string' && isKuitoModule(source.value);

    for (const specifier of children(statement, 'specifiers')) {
      const imported = nameOf(child(specifier, 'imported'));
      const local = nameOf(child(specifier, 'local'));

      if (local) bound.set(local, kuito && !!imported && SIGNAL_MAKERS.has(imported));
    }
  }

  return (name) => bound.get(name) ?? SIGNAL_MAKERS.has(name);
}

/** Names a scope binds to a signal maker's result: `const count = signal(0)`. */
function signalNames(scope: AstNode, isMaker: (name: string) => boolean): Set<string> {
  const names = new Set<string>();

  walk(scope, (node) => {
    if (node !== scope && isFunctionNode(node)) return false;
    if (node.type !== 'VariableDeclarator') return;

    const init = child(node, 'init');
    const callee = init?.type === 'CallExpression' ? nameOf(child(init, 'callee')) : undefined;
    const id = nameOf(child(node, 'id'));

    if (id && callee && isMaker(callee)) names.add(id);
  });

  return names;
}

const containsJsx = (node: AstNode) => {
  let found = false;

  walk(node, (each) => {
    if (each.type === 'JSXElement' || each.type === 'JSXFragment') found = true;

    return !found;
  });

  return found;
};

/** A component's top-level functions: `function App` and `const App = () => …`. */
function components(root: AstNode): Array<{ name: string; node: AstNode }> {
  return children(root, 'body').flatMap((statement) => {
    const declaration = statement.type.startsWith('Export')
      ? (child(statement, 'declaration') ?? statement)
      : statement;

    if (declaration.type === 'FunctionDeclaration')
      return [{ name: nameOf(child(declaration, 'id')) ?? 'the component', node: declaration }];

    return declaration.type === 'VariableDeclaration'
      ? children(declaration, 'declarations').flatMap((each) => {
          const init = child(each, 'init');

          return init && isFunctionNode(init)
            ? [{ name: nameOf(child(each, 'id')) ?? 'the component', node: init }]
            : [];
        })
      : [];
  });
}

/**
 * A signal's `.value` read where nothing re-runs it: in a component's body,
 * outside JSX and outside any function. The component sets up once, so the
 * read sees the first value only. JSX expressions are compiled to functions
 * the kernel re-runs, and handlers run on each event, so reads there follow.
 */
export function bodyReads({ root, file, locate }: ParsedModule): Diagnostic[] {
  const isMaker = makers(root);
  const moduleSignals = signalNames(root, isMaker);
  const found: Diagnostic[] = [];

  for (const { name, node } of components(root)) {
    const body = child(node, 'body');

    if (!body || !containsJsx(body)) continue;

    const signals = new Set([...moduleSignals, ...signalNames(node, isMaker)]);

    walk(body, (each, parent, key) => {
      if (isFunctionNode(each) || each.type === 'JSXExpressionContainer') return false;
      if (each.type !== 'MemberExpression' || each.computed) return;

      const object = nameOf(child(each, 'object'));

      if (!object || !signals.has(object) || nameOf(child(each, 'property')) !== 'value') return;

      // A write is not a read.
      if (
        (parent?.type === 'AssignmentExpression' && key === 'left') ||
        parent?.type === 'UpdateExpression'
      )
        return;

      const at = locate(each.start);

      found.push({
        message:
          `${object}.value is read once, when ${name} sets up, so it never changes there. ` +
          `Read it inside JSX ({${object}.value}) or a function, or derive a signal with computed(() => …).`,
        file,
        line: at.line,
        column: at.column,
        plugin: 'kuito-transform',
      });
    });
  }

  return found;
}
