import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { Profile } from './config.ts';

export const run = promisify(execFile);

/**
 * The Hermes V1 release both platforms link, read by the CLI, Gradle and
 * CI. Hermes only runs bytecode of its own release, so the
 * compiler below must come from the same one.
 */
export interface HermesPin {
  version: string;
  /** The facebook/hermes commit tagged `hermes-v<version>`. */
  commit: string;
  /** The npm registry's integrity hash of hermes-compiler's tarball. */
  compilerIntegrity: string;
  /** SHA-256 of Maven Central's hermes-ios debug tarball (src/cli/hermes-ios.ts). */
  iosSha256: string;
  /** SHA-256 of its release tarball, which release shells link. */
  iosReleaseSha256: string;
}

const PIN_PATH = fileURLToPath(new URL('../../native/hermes.json', import.meta.url));

function readPin(path: string): HermesPin {
  const pin: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const field = (name: keyof HermesPin) => {
    const value = typeof pin === 'object' && pin !== null ? Reflect.get(pin, name) : undefined;

    if (typeof value !== 'string' || !value)
      throw new Error(`${path} needs a string "${name}"; restore it from git`);

    return value;
  };

  return {
    version: field('version'),
    commit: field('commit'),
    compilerIntegrity: field('compilerIntegrity'),
    iosSha256: field('iosSha256'),
    iosReleaseSha256: field('iosReleaseSha256'),
  };
}

export const hermes = readPin(PIN_PATH);

const binaries: Partial<Record<NodeJS.Platform, string>> = {
  darwin: 'osx-bin/hermesc',
  linux: 'linux64-bin/hermesc',
  win32: 'win64-bin/hermesc.exe',
};

/** The compiler's path inside the hermes-compiler package tarball. */
export function hermescEntry(platform: NodeJS.Platform = process.platform) {
  const binary = binaries[platform];

  if (!binary) throw new Error(`hermes-compiler ships no Hermes compiler for ${platform}`);

  return `package/hermesc/${binary}`;
}

export function compilerTarball() {
  return `https://registry.npmjs.org/hermes-compiler/-/hermes-compiler-${hermes.version}.tgz`;
}

export async function download(url: string, name: string) {
  const response = await fetch(url).catch((error: unknown) => {
    throw new Error(`Could not download ${name} from ${url}: ${String(error)}`);
  });

  if (!response.ok)
    throw new Error(`Could not download ${name}: ${url} answered ${response.status}`);

  return Buffer.from(await response.arrayBuffer());
}

/** A hash as a pin records it. */
export interface Digest {
  name: string;
  of: (bytes: Buffer) => string;
}

/** Refuses downloaded bytes unless their digest is the pinned one. */
export function verifyPinned(bytes: Buffer, digest: Digest, pinned: string, url: string) {
  if (digest.of(bytes) !== pinned)
    throw new Error(`${url} does not match its pinned ${digest.name}; refusing to use it`);

  return bytes;
}

/**
 * Fills a cache directory beside itself and renames it into place, so an
 * interrupted download never leaves a half-written one behind.
 */
export async function fillCache(directory: string, fill: (staging: string) => Promise<void>) {
  await mkdir(dirname(directory), { recursive: true });

  const staging = await mkdtemp(`${directory}-`);

  try {
    await fill(staging);

    await rename(staging, directory).catch((error: NodeJS.ErrnoException) => {
      // Another build got there first.
      if (error.code !== 'ENOTEMPTY' && error.code !== 'EEXIST') throw error;
    });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

const INTEGRITY: Digest = {
  name: 'integrity',
  of: (bytes) => 'sha512-' + createHash('sha512').update(bytes).digest('base64'),
};

/**
 * The pinned compiler, downloaded into ~/.cache/kuito on first use: the
 * hermes-compiler package is checked against its pinned integrity hash and
 * only `hermesc` is kept.
 */
export async function hermesc() {
  const entry = hermescEntry();
  const directory = join(homedir(), '.cache', 'kuito', `hermesc-${hermes.version}`);
  const binary = join(directory, entry);

  if (await exists(binary)) return binary;

  const url = compilerTarball();
  const tarball = verifyPinned(
    await download(url, 'the Hermes compiler'),
    INTEGRITY,
    hermes.compilerIntegrity,
    url,
  );

  await fillCache(directory, async (staging) => {
    await writeFile(join(staging, 'hermes-compiler.tgz'), tarball);
    await run('tar', ['-xzf', join(staging, 'hermes-compiler.tgz'), '-C', staging, entry]);
    await rm(join(staging, 'hermes-compiler.tgz'));
  });

  return binary;
}

/**
 * Bytecode spares the device parsing and compiling the script. Debug bundles
 * keep full debug info (`-g3`) and are not optimized (`-O0`): Chrome DevTools
 * can then show and evaluate every scope (docs/devtools.md), and stack traces
 * keep the source's line and column for the dev server to symbolicate.
 * Release bundles are optimized and carry no debug info: nothing attaches to
 * them, and what a device runs is what is measured. Their stacks name
 * bytecode offsets instead, which the source map hermesc writes beside the
 * output (`<output>.map`) resolves (src/cli/crash-reports.ts).
 */
const OPTIMIZATION: Record<Profile, readonly string[]> = {
  debug: ['-O0', '-g3'],
  release: ['-O', '-output-source-map'],
};

export function bytecodeArgs(source: string, output: string, profile: Profile = 'debug') {
  return ['-emit-binary', ...OPTIMIZATION[profile], '-w', '-out', output, source];
}

export async function compileBytecode(source: string, output: string, profile: Profile = 'debug') {
  await run(await hermesc(), bytecodeArgs(source, output, profile));
}
