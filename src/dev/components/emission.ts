import { fileURLToPath } from 'node:url';
import type { AstNode } from '../ast.ts';
import type { Edit } from '../edits.ts';
import type { OuterWrapper } from '../threads/index.ts';
import type { RegisteredComponent } from './identities.ts';

const FRAMEWORK = [
  fileURLToPath(new URL('../../ui/', import.meta.url)),
  fileURLToPath(new URL('../../native/', import.meta.url)),
];

/**
 * Whether `id` is Kuito's own UI code, whose components are registered by
 * the pure call their function is wrapped in, so a bundle drops each one the
 * app never renders, with the native modules it calls.
 *
 * An app's components are registered by a statement after the module
 * instead: wrapping a declaration makes it a `var`, set when its module runs
 * rather than hoisted, and a module of the app's that reads one across an
 * import cycle, as a route table may, would read undefined. Kuito's own
 * modules read none that way (test/compiler-native-modules.test.ts).
 */
export const isFrameworkModule = (id: string) => FRAMEWORK.some((root) => id.startsWith(root));

/**
 * Each component's registration as the pure call its function is wrapped in:
 * `defineComponent(id, function, hash, cacheable)` returns the function, so
 * the module registers what the bundle keeps where it is defined.
 */
export function registrations(
  components: readonly RegisteredComponent[],
): Map<AstNode, OuterWrapper> {
  return new Map(
    components.map(({ node, declaration, id, name, hash, cacheable }) => [
      node,
      {
        name,
        declaration,
        wrapper: {
          open: `/* @__PURE__ */ globalThis.__kuito.defineComponent(${JSON.stringify(id)}, `,
          close: `, ${JSON.stringify(hash)}, ${cacheable})`,
        },
      },
    ]),
  );
}

/** Registers the module's components with the kernel, after everything they read is defined. */
export function defineComponents(definitions: readonly RegisteredComponent[]): Edit[] {
  if (!definitions.length) return [];

  const calls = definitions.map(
    ({ id, name, hash, cacheable }) =>
      `globalThis.__kuito.defineComponent(${JSON.stringify(id)},${name},${JSON.stringify(hash)},${cacheable});`,
  );

  return [{ op: 'append', text: '\n' + calls.join('\n') }];
}
