import type { Program } from 'oxc-parser';
import { child, children, isFunctionNode, nameOf, walk, type AstNode } from '../ast.ts';
import type { Edit } from '../edits.ts';
import { isKuitoModule } from '../parse.ts';

/**
 * Kuito's hooks by exported name: the slot kind each takes in the kernel, and
 * the argument that names its slot, which the compiler fills in.
 */
const HOOKS: Record<string, { kind: string; nameArgument: number; byFile?: true }> = {
  signal: { kind: 'state', nameArgument: 1 },
  store: { kind: 'state', nameArgument: 1 },
  motion: { kind: 'motion', nameArgument: 1 },
  ref: { kind: 'ref', nameArgument: 0 },
  task: { kind: 'async', nameArgument: 2 },
  resource: { kind: 'async', nameArgument: 1 },
  onMount: { kind: 'mount', nameArgument: 1 },
  onCleanup: { kind: 'cleanup', nameArgument: 1 },
  effect: { kind: 'effect', nameArgument: 1 },
  watch: { kind: 'watch', nameArgument: 3 },
  // A key the whole app shares: named by its file and its top-level variable only.
  inherited: { kind: 'inherited', nameArgument: 1, byFile: true },
};

type Hook = (typeof HOOKS)[string];

/**
 * The hook each module-level name is bound to: an import from Kuito by its
 * exported name, null for any other import or top-level declaration. A name
 * bound nowhere is the global hook of that name. Bindings inside functions
 * are not resolved.
 */
function hookBindings(program: Program): (name: string) => Hook | null {
  const bound = new Map<string, Hook | null>();

  for (const entry of program.body) {
    if (entry.type === 'ImportDeclaration') {
      for (const specifier of entry.specifiers) {
        const imported =
          specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier'
            ? specifier.imported.name
            : null;
        const hook =
          imported && isKuitoModule(entry.source.value) && Object.hasOwn(HOOKS, imported)
            ? HOOKS[imported]
            : null;

        bound.set(specifier.local.name, hook);
      }

      continue;
    }

    const declaration = ('declaration' in entry && entry.declaration) || entry;

    if (declaration.type === 'FunctionDeclaration' && declaration.id)
      bound.set(declaration.id.name, null);
    else if (declaration.type === 'VariableDeclaration')
      for (const item of declaration.declarations)
        if (item.id.type === 'Identifier') bound.set(item.id.name, null);
  }

  return (name) => {
    if (bound.has(name)) return bound.get(name) ?? null;

    return Object.hasOwn(HOOKS, name) ? HOOKS[name] : null;
  };
}

/** Pass `name` as the hook's naming argument, padding the optional ones before it. */
function nameHook(call: AstNode, hook: Hook, name: string): Edit | null {
  const args = children(call, 'arguments');

  if (args.length > hook.nameArgument || args.some((arg) => arg.type === 'SpreadElement'))
    return null;

  const last = args.at(-1);
  const values = [
    ...Array.from({ length: hook.nameArgument - args.length }, () => 'undefined'),
    JSON.stringify(name),
  ].join(', ');

  return last
    ? { op: 'appendLeft', at: last.end, text: ', ' + values }
    : { op: 'appendLeft', at: call.end - 1, text: values };
}

/** A function's name for its hooks: its own, or the variable it initializes. */
function scopeName(node: AstNode, parent: AstNode | undefined): string | undefined {
  if (
    (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') &&
    nameOf(child(node, 'id'))
  )
    return nameOf(child(node, 'id'));

  if (isFunctionNode(node) && parent?.type === 'VariableDeclarator')
    return nameOf(child(parent, 'id'));
}

/**
 * The kernel finds a hook's slot by name (docs/reactivity.md):
 * `const visits = state(1)` becomes `state(1, "visits")`, and a call
 * assigned to nothing takes its ordinal among its kind in the function,
 * `effect(fn, "#2")`, so it keeps its slot wherever it runs.
 */
export function hookNames(
  program: Program,
  root: AstNode,
  file: string,
  naming: (hook: Hook) => boolean = () => true,
): Edit[] {
  const edits: Edit[] = [];
  const hookOf = hookBindings(program);
  // Hook calls so far by function, then by slot kind.
  const counts = new Map<string, Map<string, number>>();
  const scopes = new Map<AstNode, string>();

  walk(root, (node, parent) => {
    const scope = scopeName(node, parent) ?? (parent && scopes.get(parent)) ?? '<module>';

    scopes.set(node, scope);

    const callee = node.type === 'CallExpression' ? nameOf(child(node, 'callee')) : undefined;
    const hook = callee ? hookOf(callee) : null;

    if (!hook || !naming(hook)) return;

    const variable =
      parent?.type === 'VariableDeclarator' && child(parent, 'id')?.type === 'Identifier'
        ? String(nameOf(child(parent, 'id')))
        : null;

    // A key made anywhere else would share its name with every other one made there.
    if (hook.byFile && (scope !== '<module>' || variable === null)) return;

    const kinds = counts.get(scope) ?? new Map<string, number>();
    const ordinal = (kinds.get(hook.kind) ?? 0) + 1;

    kinds.set(hook.kind, ordinal);
    counts.set(scope, kinds);

    const name = variable ?? '#' + ordinal;
    const edit = nameHook(node, hook, hook.byFile ? file + '#' + name : name);

    if (edit) edits.push(edit);
  });

  return edits;
}
