// Scope effects (docs/native-modules.md#scope-effects) belong to the component
// setting up when they are called. Called anywhere else, nothing would own
// them and the kernel throws on the device; this pass reports the call at its
// line instead. A call that passes `{ scope: app }` says the app owns it.
import type { Plugin } from 'rolldown';
import { child, childNodes, children, isFunctionNode, nameOf, type AstNode } from './ast.ts';
import { isAppModule, isVirtualModule, parseModule } from './parse.ts';

/** What a capability's scope effects are called, and whether the app may own one. */
interface Effect {
  /** As the message names it. */
  name: string;
  /** False for a view's state ref, which only a component can own. */
  appScope: boolean;
}

const KEEP_AWAKE: Effect = { name: 'keepAwake', appScope: true };
const PLAYER: Effect = { name: 'audio.player', appScope: true };
const RECORDER: Effect = { name: 'audio.recorder', appScope: true };
const refEffect = (name: string): Effect => ({ name, appScope: false });

/** The root entry's direct exports that are scope effects. */
const FUNCTIONS: Record<string, Effect> = {
  keepAwake: KEEP_AWAKE,
  videoRef: refEffect('videoRef'),
  cameraRef: refEffect('cameraRef'),
  webViewRef: refEffect('webViewRef'),
};

/** The members of a capability namespace that are scope effects, by the namespace's name. */
const MEMBERS: Record<string, Record<string, Effect>> = {
  audio: { player: PLAYER, recorder: RECORDER },
};

/**
 * Whether a specifier names Kuito's root entry: the package, or the same
 * files by path, as Kuito's tests and examples import them.
 */
const isRoot = (specifier: string): boolean =>
  specifier === 'kuito' || /\/src\/(?:ui|native)(?:\/index(?:\.ts)?)?$/.test(specifier);

/** Which local names are scope effects, and which are namespaces holding some. */
function bindings(program: AstNode) {
  const functions = new Map<string, Effect>();
  const namespaces = new Map<string, Record<string, Effect>>();

  for (const statement of children(program, 'body')) {
    if (statement.type !== 'ImportDeclaration') continue;

    const specifier = child(statement, 'source')?.value;

    if (typeof specifier !== 'string' || !isRoot(specifier)) continue;

    for (const specifier of children(statement, 'specifiers')) {
      const local = nameOf(child(specifier, 'local'));

      if (!local) continue;

      if (specifier.type !== 'ImportSpecifier') continue;

      const imported = nameOf(child(specifier, 'imported'));

      if (!imported) continue;

      const effect = Object.hasOwn(FUNCTIONS, imported) ? FUNCTIONS[imported] : undefined;

      if (effect) functions.set(local, effect);
      if (Object.hasOwn(MEMBERS, imported)) namespaces.set(local, MEMBERS[imported]);
    }
  }

  return { functions, namespaces };
}

/** The scope effect a call makes, if it makes one. */
function effectOf(callee: AstNode | undefined, scope: ReturnType<typeof bindings>) {
  if (callee?.type === 'Identifier') return scope.functions.get(String(callee.name));

  if (callee?.type !== 'MemberExpression' || callee.computed) return undefined;

  const namespace = nameOf(child(callee, 'object'));
  const member = nameOf(child(callee, 'property'));

  return namespace && member ? scope.namespaces.get(namespace)?.[member] : undefined;
}

/** Whether a call passes an options object that names its `scope`. */
function ownedByApp(call: AstNode): boolean {
  return children(call, 'arguments').some(
    (argument) =>
      argument.type === 'ObjectExpression' &&
      children(argument, 'properties').some(
        (property) => nameOf(child(property, 'key')) === 'scope',
      ),
  );
}

/** A component: a function named with a capital letter, as a declaration or a variable. */
function isComponent(fn: AstNode, parent: AstNode | undefined): boolean {
  const name =
    nameOf(child(fn, 'id')) ??
    (parent?.type === 'VariableDeclarator' ? nameOf(child(parent, 'id')) : undefined);

  return parent?.type === 'ExportDefaultDeclaration' || (name !== undefined && /^[A-Z]/.test(name));
}

interface Misplaced {
  effect: Effect;
  start: number;
}

/**
 * The scope effects called outside a component's body: at module scope, in a
 * helper or in a handler. A call is in setup when the nearest function around
 * it is a component.
 */
function misplaced(program: AstNode): Misplaced[] {
  const scope = bindings(program);
  const found: Misplaced[] = [];

  if (!scope.functions.size && !scope.namespaces.size) return found;

  const scan = (node: AstNode, setup: boolean) => {
    for (const [, inner] of childNodes(node)) {
      if (isFunctionNode(inner)) {
        scan(inner, isComponent(inner, node));
        continue;
      }

      if (inner.type === 'CallExpression') {
        const effect = effectOf(child(inner, 'callee'), scope);

        if (effect && !setup && !(effect.appScope && ownedByApp(inner)))
          found.push({ effect, start: inner.start });
      }

      scan(inner, setup);
    }
  };

  scan(program, false);

  return found;
}

/** One line for every misplaced call in a module, so one build names them all. */
function message(calls: Misplaced[], line: (call: Misplaced) => number): string {
  const [first] = calls;
  const named =
    calls.length === 1
      ? `${first.effect.name}() runs`
      : calls.map((call) => `${call.effect.name}() at line ${line(call)}`).join(', ') + ' run';
  const fix = calls.every((call) => call.effect.appScope)
    ? 'call it in the component body, or pass { scope: app } for one the app holds'
    : 'call it in the component body, as ref() is';

  return `${named} outside a component's setup, so nothing would own it: ${fix} (docs/native-modules.md#scope-effects)`;
}

export function createScopeEffectsPlugin(): Plugin {
  return {
    name: 'kuito-scope-effects',
    transform(source: string, id: string) {
      if (
        isVirtualModule(id) ||
        !isAppModule(id) ||
        !/['"]kuito['"/]|\/src\/(ui|native)/.test(source)
      )
        return null;

      const parsed = parseModule(id, source);

      // A syntax error is reported by the bundler itself.
      if (parsed.errors.length) return null;

      const calls = misplaced(parsed.root);

      if (!calls.length) return null;

      throw parsed.error(
        message(calls, (call) => parsed.locate(call.start).line),
        calls[0].start,
      );
    },
  };
}
