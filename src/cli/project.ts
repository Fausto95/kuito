import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveConfig, type AppConfig } from './kuito-config.ts';

/** Where `kuito` runs: a directory with a kuito.config.ts, like the one `kuito create` makes. */
export interface Project {
  root: string;
  /** Generated shells and their builds, never committed (docs/apps.md). */
  cache: string;
  /** The `kuito.config.ts` environment `config` is for. */
  environment: string;
  config: AppConfig;
}

export const CONFIG_FILE = 'kuito.config.ts';

async function readConfig(file: string, environment: string) {
  const module: unknown = await import(pathToFileURL(file).href);

  return resolveConfig(
    typeof module === 'object' && module !== null && 'default' in module
      ? module.default
      : undefined,
    file,
    environment,
  );
}

export async function loadProject(root: string, environment: string): Promise<Project> {
  const file = join(root, CONFIG_FILE);

  if (!existsSync(file))
    throw new Error(
      `No ${CONFIG_FILE} in ${root}: run kuito in an app's directory, or make one with kuito create <Name> (docs/apps.md).`,
    );

  return {
    root,
    cache: join(root, '.kuito'),
    environment,
    config: await readConfig(file, environment),
  };
}
