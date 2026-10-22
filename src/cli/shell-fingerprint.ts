/**
 * A shell's fingerprint (docs/updates.md#compatibility): a hash of what an
 * update's bytecode reaches natively, so a shell refuses an update made
 * for native code it lacks. It covers the framework's native code for the
 * platform and the Hermes it pins, the native modules the shell links and
 * the functions of its link table, the Info.plist or manifest entries, the
 * images and fonts in the shell, and the database migrations. It leaves out
 * what an update cannot depend on: the version, the build number, the
 * app's name, its icon and launch screen.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { BundledAsset } from '../dev/assets.ts';
import { ROOT, type Platform } from './config.ts';
import type { NativeModuleSource } from './modules.ts';
import { nativeEntries } from './shells.ts';
import type { AppConfig } from './kuito-config.ts';

export interface FingerprintInputs {
  platform: Platform;
  /** The framework's checkout or package; this one by default. */
  framework?: string;
  config: AppConfig;
  /** The native modules the shell compiles in. */
  modules: readonly NativeModuleSource[];
  /** The link table the shell compiles, as generated (src/cli/link-swift.ts, link-kotlin.ts). */
  link: string;
  /** The images the app imports, which the shell holds. */
  assets: readonly BundledAsset[];
}

/** The framework's native code each shell compiles, under `native/`, and what in it is not shipped. */
const FRAMEWORK: Record<Platform, { directories: string[]; skipped: string[] }> = {
  ios: { directories: ['shared', 'ios'], skipped: ['ios/Tests', 'ios/TestHost'] },
  android: { directories: ['shared', 'android'], skipped: ['android/app/src/androidTest'] },
};

/** Info.plist keys an update's code cannot depend on: the name, version, build and launch screen. */
const UNRELATED_KEYS = new Set([
  'CFBundleDisplayName',
  'CFBundleShortVersionString',
  'CFBundleVersion',
  'UILaunchScreen',
  'UILaunchStoryboardName',
]);

/**
 * What a shell compiles from: sources, build scripts and resources, by
 * extension. Anything else under `native/` is a machine's or a build's,
 * like `local.properties`, Kotlin's logs, stale bytecode or a generated
 * Xcode project, and would make the fingerprint differ between machines.
 */
const SOURCES = /\.(swift|kt|kts|java|h|hpp|c|cc|cpp|m|mm|pro|yml|xml|txt|cmake)$/;

/** Generated or build output, whatever its files are named. */
const GENERATED = new Set(['build', 'Resources', 'assets', 'xcuserdata']);

const isSource = (path: string) =>
  SOURCES.test(path) &&
  !path
    .split('/')
    .some((part) => part.startsWith('.') || GENERATED.has(part) || part.endsWith('.xcodeproj'));

const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');

/** Every file under `directory` but the `skipped` ones, by path relative to `base`, with its hash. */
async function hashed(base: string, directory: string, skipped: readonly string[] = []) {
  if (!existsSync(directory)) return [];

  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .map((file) => relative(base, file).split(sep).join('/'))
    .filter(
      (path) =>
        isSource(path) && !skipped.some((skip) => path === skip || path.startsWith(skip + '/')),
    )
    .sort();

  return Promise.all(
    files.map(async (path) => [path, sha256(await readFile(join(base, path)))] as const),
  );
}

export async function shellFingerprint({
  platform,
  framework = ROOT,
  config,
  modules,
  link,
  assets,
}: FingerprintInputs) {
  const native = join(framework, 'native');
  const { directories, skipped } = FRAMEWORK[platform];
  const linked = modules.filter(({ manifest }) => manifest[platform]);
  const entries = nativeEntries(config, linked, 'release');

  const inputs = {
    platform,
    hermes: sha256(await readFile(join(native, 'hermes.json'))),
    framework: (
      await Promise.all(
        directories.map((directory) => hashed(native, join(native, directory), skipped)),
      )
    ).flat(),
    modules: await Promise.all(
      linked.map(async ({ manifest, directory }) => ({
        manifest,
        files: await hashed(directory, join(directory, platform)),
      })),
    ),
    link: sha256(link),
    entries:
      platform === 'ios'
        ? [
            Object.entries(entries.infoPlist).filter(([key]) => !UNRELATED_KEYS.has(key)),
            entries.entitlements,
          ]
        : entries.manifest,
    images: assets.map(({ name, hash }) => `${name} ${hash}`).sort((a, b) => a.localeCompare(b)),
    fonts: await Promise.all(
      config.fonts.map(async ({ path, family, weight, style }) => ({
        file: sha256(await readFile(path)),
        family,
        weight,
        style,
      })),
    ),
    migrations: config.migrations,
  };

  return sha256(JSON.stringify(inputs));
}
