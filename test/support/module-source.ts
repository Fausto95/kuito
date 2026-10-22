import { basename, join } from 'node:path';
import { catalogOf } from '../../src/dev/modules/catalog.ts';
import { validateManifest, type NativeModuleSource } from '../../src/cli/modules.ts';

/**
 * A module in `directory` as discovery reads it: a spec declaring `needs`
 * (`name`, `always`, `ios`, `android`) and no members.
 */
export function moduleAt(
  directory: string,
  { name, ...needs }: { name: string } & Record<string, unknown>,
): NativeModuleSource {
  const file = join(directory, basename(directory) + '.ts');
  const source = `import { defineModule } from 'kuito';
export default defineModule(${JSON.stringify(name)}, ${JSON.stringify(needs)});
`;
  const [spec] = catalogOf([{ file, source }]).modules;

  if (!spec) throw new Error(`${file} declares no module`);

  return { manifest: validateManifest({ name, ...needs }, file), directory, file, spec };
}
