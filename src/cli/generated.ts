/**
 * Files the CLI generates from config and source images into an app's
 * `.kuito/` (app icons, splash screens): written only when the config or a
 * source's bytes changed since the last build, with a stamp beside them.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { IconSource } from './kuito-config.ts';

/** Generated files, by path under their directory. */
export interface Generated {
  files: Record<string, Uint8Array | string>;
  /** What was fixed on the way, for the CLI reporter. */
  warnings: string[];
}

/** Reads a source image's bytes for a pure generator. */
export type Read = (source: IconSource) => Uint8Array;

interface Stamp {
  hash: string;
  warnings: string[];
}

const isStamp = (value: unknown): value is Stamp =>
  typeof value === 'object' &&
  value !== null &&
  'hash' in value &&
  typeof value.hash === 'string' &&
  'warnings' in value &&
  Array.isArray(value.warnings) &&
  value.warnings.every((warning) => typeof warning === 'string');

async function readStamp(file: string) {
  try {
    const stamp: unknown = JSON.parse(await readFile(file, 'utf8'));

    return isStamp(stamp) ? stamp : null;
  } catch {
    // No stamp, or one from an interrupted write: generate again.
    return null;
  }
}

async function readSource(source: IconSource) {
  try {
    return await readFile(source.path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      throw new Error(`${source.origin} does not exist`, { cause: error });

    throw error;
  }
}

/** The sources a config value names, anywhere in it. */
function sourcesIn(value: unknown): IconSource[] {
  if (typeof value !== 'object' || value === null) return [];

  if ('path' in value && 'origin' in value && typeof value.path === 'string')
    return [value as IconSource];

  return Object.values(value).flatMap(sourcesIn);
}

/**
 * Generates into `directory` when `settings` (the part of the config the
 * generator reads) or the bytes of a source it names changed since the last
 * build, and removes the directory when the generator has nothing to write.
 * Returns the generated warnings, replayed when the files were kept.
 */
export async function writeStamped(
  directory: string,
  settings: unknown,
  generate: (read: Read) => Generated | null,
) {
  const stampFile = `${directory}.stamp.json`;
  const sources = sourcesIn(settings);
  const bytes = new Map<string, Uint8Array>();

  for (const source of sources) bytes.set(source.path, await readSource(source));

  const hash = createHash('sha256').update(JSON.stringify(settings));

  for (const source of sources) hash.update(bytes.get(source.path) ?? new Uint8Array());

  const digest = hash.digest('hex');
  const stamp = await readStamp(stampFile);

  if (stamp?.hash === digest) return stamp.warnings;

  const output = generate((source) => bytes.get(source.path) ?? new Uint8Array());

  await rm(directory, { recursive: true, force: true });
  await rm(stampFile, { force: true });

  if (!output) return [];

  for (const [file, contents] of Object.entries(output.files)) {
    await mkdir(dirname(join(directory, file)), { recursive: true });
    await writeFile(join(directory, file), contents);
  }

  await writeFile(stampFile, JSON.stringify({ hash: digest, warnings: output.warnings }));

  return output.warnings;
}
