/**
 * Compiles each native module spec into its stubs (src/dev/modules/stubs.ts)
 * and, once the bundle is rendered, lists the ids of the functions it still
 * calls: the shell's link table, so a function the app never calls ships in
 * neither the bundle nor the binary (docs/native-modules.md).
 */
import type { OutputBundle, Plugin } from 'rolldown';
import { undeclaredPackage, type ModuleCatalog } from './catalog.ts';
import { moduleStubs } from './stubs.ts';

const STUBS = '\0kuito-link:';

/** A stub's call, as the bundle renders it: its id follows. */
const LINK_CALL = /\b__kuito\.link(?:Event|Live|Motion|View)?\((\d+),/g;

export interface LinkedModules {
  /** The ids the bundle calls, ascending. */
  ids: number[];
  /** The catalog the ids number. */
  catalog: ModuleCatalog | null;
}

export function createModuleSpecPlugin(
  load: () => Promise<ModuleCatalog>,
  linked: LinkedModules,
): Plugin {
  let catalog: ModuleCatalog | null = null;
  const loaded = () => {
    if (!catalog) throw new Error('kuito-module-specs: the catalog loads in buildStart');

    return catalog;
  };

  return {
    name: 'kuito-module-specs',
    async buildStart() {
      catalog = await load();
      linked.catalog = catalog;
    },
    resolveId(id: string) {
      return id.startsWith(STUBS) ? id : null;
    },
    load(id: string) {
      if (id.startsWith(STUBS))
        return { code: moduleStubs(loaded(), id.slice(STUBS.length)), moduleType: 'js' as const };

      const module = loaded().byFile.get(id);

      if (!module) {
        const undeclared = undeclaredPackage(id);

        // Uncompiled, the spec would throw on the device with no file to name.
        if (undeclared)
          throw new Error(
            `${id} is a native module of ${undeclared}, which the app's package.json does not list in dependencies: ` +
              `add it there, so its module is compiled and linked (docs/native-modules.md#ship-a-module-in-a-package)`,
          );

        return null;
      }

      const stubs = JSON.stringify(STUBS + module.spec.name);

      // The functions by name, and as the spec's default: a namespace the
      // bundler still drops unused members of.
      return {
        code: `export * from ${stubs};\nexport * as default from ${stubs};\n`,
        moduleType: 'js' as const,
      };
    },
    // The final code: Rolldown drops dead stubs after the renderChunk hooks.
    generateBundle(_options: unknown, bundle: OutputBundle) {
      const ids = new Set<number>();

      for (const output of Object.values(bundle))
        if (output.type === 'chunk')
          for (const [, id] of output.code.matchAll(LINK_CALL)) ids.add(Number(id));

      linked.ids = [...ids].sort((a, b) => a - b);
    },
  };
}
