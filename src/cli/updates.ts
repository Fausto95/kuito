/**
 * Over-the-air updates (docs/updates.md): what a release shell carries to
 * check them, the update `kuito update build` signs, and the key pair
 * `kuito update key` makes. Hosting is the app's: an update is a directory
 * of static files, uploaded as is to the config's `updates.url`.
 */
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import type { BundledAsset } from '../dev/assets.ts';
import { updateSourceMapDirectory } from './crash-reports.ts';
import { compileDeviceScripts, keepSourceMaps, type AssetOptions } from './device-assets.ts';
import type { Platform, Profile } from './config.ts';
import {
  configuredModules,
  shellModules,
  type NativeModuleSource,
  type ShellLink,
} from './modules.ts';
import { linkSource } from './shells.ts';
import { CONFIG_FILE, type Project } from './project.ts';
import { shellFingerprint } from './shell-fingerprint.ts';
import type { Environment } from './signing.ts';
import {
  createKeyPair,
  isInside,
  parsePublicKey,
  publicKeyText,
  signUpdate,
  updateId,
  updateKey,
  verifyUpdate,
  UPDATE_FORMAT,
  type UpdateManifest,
} from './update-signing.ts';

/** What a release shell reads to check its updates, in its bundle: Resources on iOS, assets on Android. */
export const UPDATE_SETTINGS_FILE = 'kuito-updates.json';

/** Where an update goes without `--out`. */
const OUTPUT = 'updates';

/** Where a shell looks for its updates, under `updates.url`: one manifest per platform and shell. */
export const updateDirectory = (out: string, platform: Platform, fingerprint: string) =>
  join(out, platform, fingerprint);

interface ShellOptions {
  project: Project;
  platform: Platform;
  modules: readonly NativeModuleSource[];
  link: ShellLink;
  assets: readonly BundledAsset[];
}

/** The fingerprint of the shell these options build (src/cli/shell-fingerprint.ts). */
export const fingerprintOf = ({ project, platform, modules, link, assets }: ShellOptions) =>
  shellFingerprint({
    platform,
    config: project.config,
    modules,
    link: linkSource(platform, modules, link),
    assets,
  });

/**
 * The update settings of a shell, as JSON, or null when it takes no
 * updates: a debug shell, or an app without `updates`. `builtAt` orders
 * the bytecode the shell embeds among updates, so none older replaces it.
 */
export async function shellUpdateSettings(
  options: ShellOptions & { profile: Profile; builtAt?: number },
) {
  const { updates } = options.project.config;

  if (options.profile !== 'release' || updates === null) return null;

  return JSON.stringify(
    {
      url: updates.url,
      publicKey: updates.publicKey,
      fingerprint: await fingerprintOf(options),
      builtAt: options.builtAt ?? Date.now(),
    },
    null,
    2,
  );
}

interface UpdateOptions {
  entry: string;
  project: Project;
  platform: Platform;
  /** `.kuito/updates` in the app by default. */
  out?: string;
  /** Where the private key comes from (src/cli/update-signing.ts); this process's by default. */
  environment?: Environment;
  compile?: AssetOptions['compile'];
  now?: () => number;
}

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

/**
 * Builds the app's release bytecode, signs it for the shell it fits and
 * writes it to `<out>/<platform>/<fingerprint>/`: the update's files under
 * its id, then `update.json`, the signed manifest a shell fetches. Upload
 * the files before the manifest, so no shell reads one whose files are not
 * there yet. The signature is checked against `updates.publicKey` before
 * anything is written: an update the shells would refuse is an error here.
 */
export async function buildUpdate({
  entry,
  project,
  platform,
  out = join(project.cache, OUTPUT),
  environment = process.env,
  compile,
  now = Date.now,
}: UpdateOptions) {
  const { updates } = project.config;

  if (updates === null)
    throw new Error(
      `An update needs a shell that checks it: set updates in ${join(project.root, CONFIG_FILE)} (docs/updates.md).`,
    );

  const key = updateKey(project.root, environment);
  const publicKey = parsePublicKey(updates.publicKey);

  if (publicKeyText(key) !== updates.publicKey)
    throw new Error(
      `The update key does not match updates.publicKey in ${join(project.root, CONFIG_FILE)}: ` +
        'shells built with that public key would refuse this update.',
    );

  const { compiled, scratch, scripts, kernelMaps } = await compileDeviceScripts(
    entry,
    project,
    platform,
    {
      profile: 'release',
      compile,
    },
  );
  const shell = await shellModules(
    project.root,
    { uses: compiled.nativeModules, links: compiled.links, linkHash: compiled.linkHash },
    configuredModules(project.config),
  );
  const fingerprint = await fingerprintOf({ project, platform, ...shell, assets: compiled.assets });
  const files = await Promise.all(
    scripts.map(async ({ path, file }) => {
      const bytes = await readFile(file);

      return { path, sha256: sha256(bytes), size: bytes.length };
    }),
  );
  const manifest: UpdateManifest = {
    format: UPDATE_FORMAT,
    id: updateId(files),
    app:
      platform === 'ios'
        ? project.config.ios.bundleIdentifier
        : project.config.android.applicationId,
    platform,
    url: updates.url,
    fingerprint,
    createdAt: now(),
    files,
  };
  const envelope = signUpdate(manifest, key);

  verifyUpdate(envelope, publicKey);

  const directory = updateDirectory(out, platform, fingerprint);
  const scriptsDirectory = join(directory, manifest.id);

  await rm(scriptsDirectory, { recursive: true, force: true });

  for (const { path, file } of scripts) {
    await mkdir(dirname(join(scriptsDirectory, path)), { recursive: true });
    await copyFile(file, join(scriptsDirectory, path));
  }

  await writeFile(join(directory, 'update.json'), JSON.stringify(envelope, null, 2));

  await keepSourceMaps(
    project,
    updateSourceMapDirectory(project, platform, manifest.id),
    scratch,
    compiled,
    kernelMaps,
  );

  return { directory, manifest };
}

/**
 * Writes a new private key to `file`, readable by its owner only, and
 * returns the public key for `updates.publicKey`. A file inside the app is
 * refused, as is one that exists: replacing a key strands every shell
 * built with the old one.
 */
export async function writeKeyPair(file: string, root: string) {
  const path = resolve(root, file);

  if (isInside(root, path))
    throw new Error(
      `${path} is inside the app: keep the update key outside it, where nothing commits it.`,
    );

  if (existsSync(path))
    throw new Error(
      `${path} already exists: shells built with its public key take only updates it signs.`,
    );

  const { privateKey, publicKey } = createKeyPair();

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, privateKey, { mode: 0o600, flag: 'wx' });

  return publicKey;
}
