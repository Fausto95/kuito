import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { ROOT } from './config.ts';
import { availableModules, BUILT_IN_MODULES, MODULE_NAME } from './modules.ts';
import type { AppConfig } from './kuito-config.ts';

/** A module named `Example` in `example/`, with the Kotlin package as `{{package}}`. */
const TEMPLATE = join(ROOT, 'templates/module');

/** A module's directory and spec file: `BatteryLevel` → `battery-level`. */
export const moduleDirectory = (name: string) =>
  name.replace(/(?<=[a-z0-9])(?=[A-Z])/g, '-').toLowerCase();

export function validateModuleName(name: string) {
  if (!MODULE_NAME.test(name))
    throw new Error(
      `Module name '${name}' is not valid: PascalCase, starting with a capital letter, like Battery.`,
    );

  return name;
}

interface CreateModuleOptions {
  name: string;
  /** The app's root, which holds modules/. */
  root: string;
  // The Kotlin package goes under the applicationId.
  config: { android: Pick<AppConfig['android'], 'applicationId'> };
}

/** Writes `modules/<name>/`, its spec and both halves; returns its files, relative to `root`. */
export async function createModule({ name, root, config }: CreateModuleOptions) {
  validateModuleName(name);

  const { modules } = await availableModules(root);

  if (
    modules.some(
      ({ manifest, file }) => manifest.name === name && file.startsWith(BUILT_IN_MODULES()),
    )
  )
    throw new Error(`${name} is a built-in module; choose another name`);

  const folder = moduleDirectory(name);
  const directory = join(root, 'modules', folder);

  if (existsSync(directory)) throw new Error(`modules/${folder} already exists`);

  const kotlinPackage = `${config.android.applicationId}.modules.${name.toLowerCase()}`;
  const templates = (await readdir(TEMPLATE, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name !== '.DS_Store')
    .map((entry) => relative(TEMPLATE, join(entry.parentPath, entry.name)));
  const files: string[] = [];

  for (const template of templates) {
    const source = await readFile(join(TEMPLATE, template), 'utf8');
    const file = join(
      directory,
      template.replaceAll('example', folder).replaceAll('Example', name),
    );

    await mkdir(dirname(file), { recursive: true });

    await writeFile(
      file,
      source.replaceAll('{{package}}', kotlinPackage).replaceAll('Example', name),
    );

    files.push(relative(root, file));
  }

  return files.sort();
}
