import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { ROOT } from './config.ts';
import { CONFIG_FILE } from './project.ts';

/** The starter app's sources; package.json and tsconfig.json are written here. */
const TEMPLATE = join(ROOT, 'templates/app');

// A directory name and, lowercased, an npm package name.
const APP_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** npm leaves dotfiles out of packages, so the template names them without the dot. */
const RENAMED: Readonly<Record<string, string>> = { gitignore: '.gitignore' };

/** Files whose `{{name}}` is the app's name and `{{id}}` its bundle id and applicationId. */
const FILLED = new Set(['README.md', CONFIG_FILE]);

/** The app's ids until it picks its own: com.example.<name>. */
const appId = (name: string) => `com.example.${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

export function validateAppName(name: string) {
  if (!APP_NAME.test(name) || name.length > 214)
    throw new Error(
      `App name '${name}' is not valid: start with a letter, then use letters, digits, - or _.`,
    );

  return name;
}

/** Installed from npm, the app takes that release; run from a checkout, the checkout. */
async function kuitoDependency(framework: string, directory: string) {
  if (!framework.split(sep).includes('node_modules'))
    return `file:${relative(directory, framework)}`;

  const file = join(framework, 'package.json');
  const manifest: unknown = JSON.parse(await readFile(file, 'utf8'));
  const version =
    typeof manifest === 'object' && manifest !== null && 'version' in manifest
      ? manifest.version
      : null;

  if (typeof version !== 'string') throw new Error(`${file} has no version`);

  return `^${version}`;
}

function packageJson(name: string, kuito: string) {
  return {
    name: name.toLowerCase(),
    private: true,
    type: 'module',
    scripts: {
      start: 'kuito dev',
      ios: 'kuito dev ios',
      android: 'kuito dev android',
      test: 'kuito test',
    },
    dependencies: { kuito },
  };
}

// App code is bundled by Kuito's compiler, which owns JSX: this file is for
// the editor and `tsc`, and mirrors the framework's own tsconfig.app.json.
const TSCONFIG = {
  compilerOptions: {
    target: 'ES2024',
    lib: ['ES2024'],
    module: 'ESNext',
    moduleResolution: 'Bundler',
    jsx: 'preserve',
    jsxFactory: '__kuitoJSX',
    jsxFragmentFactory: '__kuitoFragment',
    types: [],
    strict: true,
    noEmit: true,
    isolatedModules: true,
    verbatimModuleSyntax: true,
    skipLibCheck: true,
  },
  include: [
    'app',
    'modules',
    'tests',
    'kuito.config.ts',
    'node_modules/kuito/src/ui/globals.d.ts',
    'node_modules/kuito/src/ui/assets.d.ts',
  ],
};

const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

async function templateFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name !== '.DS_Store')
    .map((entry) => relative(TEMPLATE, join(entry.parentPath, entry.name)))
    .sort();
}

async function isEmptyDirectory(directory: string) {
  return !existsSync(directory) || (await readdir(directory)).length === 0;
}

interface CreateOptions {
  name: string;
  /** Where the app goes: a new or empty directory. */
  directory: string;
  /** The Kuito the app depends on: a checkout, or a package installed from npm. */
  framework: string;
}

/** Writes a new app; returns its files, relative to `directory`. */
export async function createApp({ name, directory, framework }: CreateOptions) {
  validateAppName(name);

  if (!(await isEmptyDirectory(directory)))
    throw new Error(`${directory} is not empty. Choose another name or empty it first.`);

  const files: Record<string, string | Buffer> = {
    'package.json': json(packageJson(name, await kuitoDependency(framework, directory))),
    'tsconfig.json': json(TSCONFIG),
  };

  for (const file of await templateFiles(TEMPLATE)) {
    const source = await readFile(join(TEMPLATE, file));

    files[RENAMED[file] ?? file] = FILLED.has(file)
      ? source.toString('utf8').replaceAll('{{name}}', name).replaceAll('{{id}}', appId(name))
      : source;
  }

  for (const [file, contents] of Object.entries(files)) {
    await mkdir(dirname(join(directory, file)), { recursive: true });
    await writeFile(join(directory, file), contents);
  }

  return Object.keys(files);
}
