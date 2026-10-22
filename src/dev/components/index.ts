import type { ParsedModule } from '../parse.ts';
import { bodyReads } from './body-reads.ts';
import { checkPressableLabels } from './pressable-labels.ts';
import { defineComponents, isFrameworkModule, registrations } from './emission.ts';
import { hookNames } from './hooks.ts';
import { componentDefinitions } from './identities.ts';
import { wrapExpressions } from './wrapping.ts';

export type { ComponentDefinition } from './identities.ts';

/**
 * Kuito's component API: hooks named for their slots, JSX data expressions
 * made lazy, and each component registered with the hash Live Patch retains
 * it by. Warns about a signal read once where nothing re-runs it.
 */
export function componentPass(module: ParsedModule) {
  const { program, root, file } = module;

  checkPressableLabels(module);

  const registered = componentDefinitions(module);
  const wrapped = wrapExpressions(root);
  const framework = isFrameworkModule(module.id);

  return {
    edits: [
      ...hookNames(program, root, file),
      ...wrapped.edits,
      ...(framework ? [] : defineComponents(registered)),
    ],
    expressions: wrapped.expressions,
    registrations: framework ? registrations(registered) : new Map(),
    components: registered.map(
      ({ node: _node, declaration: _declaration, ...definition }) => definition,
    ),
    warnings: bodyReads(module),
  };
}

/**
 * A module without JSX defines no component, but may declare a key the app
 * shares (`inherited()`): it is named all the same, so a Live Patch keeps it.
 */
export function sharedKeyNames({ program, root, file }: ParsedModule) {
  return hookNames(program, root, file, (hook) => hook.byFile === true);
}
