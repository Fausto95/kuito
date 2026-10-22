/**
 * The credentials a release build signs with (docs/cli.md#signing). What
 * is not secret comes from kuito.config.ts or, for CI, the environment,
 * which wins; secrets come from the environment only, so none is committed
 * and none reaches a command line another process could read.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CONFIG_FILE, type Project } from './project.ts';

export type Environment = Readonly<Record<string, string | undefined>>;

/** Android's upload key: where the config names it, and the variables CI sets instead. */
export const UPLOAD_KEY = {
  keystore: { key: 'android.signing.keystore', env: 'KUITO_ANDROID_KEYSTORE' },
  keyAlias: { key: 'android.signing.keyAlias', env: 'KUITO_ANDROID_KEY_ALIAS' },
} as const;

/** Read by native/android/app/build.gradle.kts itself, never passed as properties. */
export const UPLOAD_KEY_PASSWORDS = [
  'KUITO_ANDROID_KEYSTORE_PASSWORD',
  'KUITO_ANDROID_KEY_PASSWORD',
] as const;

/** An App Store Connect API key, for signing where no Apple account is signed in to Xcode. */
export const APP_STORE_CONNECT_KEY = {
  '-authenticationKeyPath': 'KUITO_APP_STORE_CONNECT_KEY_PATH',
  '-authenticationKeyID': 'KUITO_APP_STORE_CONNECT_KEY_ID',
  '-authenticationKeyIssuerID': 'KUITO_APP_STORE_CONNECT_ISSUER_ID',
} as const;

export interface UploadKey {
  keystore: string;
  keyAlias: string;
}

/**
 * The upload key a release Android build signs with, or null when neither
 * the config nor the environment names one. A key named in part, a
 * keystore that does not exist or a password missing from the
 * environment throws.
 */
export function uploadKey({ root, config }: Pick<Project, 'root' | 'config'>, env: Environment) {
  const named = {
    keystore: env[UPLOAD_KEY.keystore.env] || config.android.signing.keystore,
    keyAlias: env[UPLOAD_KEY.keyAlias.env] || config.android.signing.keyAlias,
  };
  const file = join(root, CONFIG_FILE);

  const { keystore: given, keyAlias } = named;

  if (!given && !keyAlias) return null;

  if (!given || !keyAlias) {
    const part = given ? 'keyAlias' : 'keystore';

    throw new Error(
      `The upload key names no ${part}: set ${UPLOAD_KEY[part].key} in ${file}, or ${UPLOAD_KEY[part].env}.`,
    );
  }

  const keystore = resolve(root, given);

  if (!existsSync(keystore))
    throw new Error(
      `The upload keystore ${keystore} does not exist: fix ${UPLOAD_KEY.keystore.key} in ${file}, or ${UPLOAD_KEY.keystore.env}.`,
    );

  const missing = UPLOAD_KEY_PASSWORDS.filter((name) => !env[name]);

  if (missing.length > 0)
    throw new Error(
      `Signing with ${keystore} needs its passwords in the environment: set ${missing.join(' and ')}. ` +
        'They never go in kuito.config.ts.',
    );

  return { keystore, keyAlias } satisfies UploadKey;
}

/** The key a store build needs: an .aab the debug keystore signed is one Google Play rejects. */
export function storeUploadKey(project: Pick<Project, 'root' | 'config'>, env: Environment) {
  const key = uploadKey(project, env);

  if (!key)
    throw new Error(
      `A store build signs with your upload key: set ${UPLOAD_KEY.keystore.key} and ${UPLOAD_KEY.keyAlias.key} ` +
        `in ${join(project.root, CONFIG_FILE)}, or ${UPLOAD_KEY.keystore.env} and ${UPLOAD_KEY.keyAlias.env}, ` +
        `and its passwords in ${UPLOAD_KEY_PASSWORDS.join(' and ')}. Pass --device to build an APK for a device instead.`,
    );

  return key;
}

/** What the Gradle script reads of the key: its file and alias. */
export const uploadKeyProperties = (key: UploadKey | null) =>
  key
    ? [`-Pkuito.signing.keystore=${key.keystore}`, `-Pkuito.signing.keyAlias=${key.keyAlias}`]
    : [];

/**
 * xcodebuild's App Store Connect authentication, from the environment: all
 * three variables or none, when Xcode signs with the account signed in to it.
 */
export function appStoreConnectKey(env: Environment, root: string) {
  const entries = Object.entries(APP_STORE_CONNECT_KEY);
  const missing = entries.filter(([, name]) => !env[name]).map(([, name]) => name);

  if (missing.length === entries.length) return [];

  if (missing.length > 0)
    throw new Error(
      `An App Store Connect API key needs ${entries.map(([, name]) => name).join(', ')}: ` +
        `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set.`,
    );

  // Relative to the app, as the keystore is: xcodebuild runs in .kuito/ios.
  const path = resolve(root, env[APP_STORE_CONNECT_KEY['-authenticationKeyPath']] ?? '');

  if (!existsSync(path))
    throw new Error(
      `The App Store Connect API key ${path} does not exist: fix ${APP_STORE_CONNECT_KEY['-authenticationKeyPath']}.`,
    );

  return entries.flatMap(([flag, name]) => [
    flag,
    flag === '-authenticationKeyPath' ? path : (env[name] ?? ''),
  ]);
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * `xcodebuild -exportArchive`'s options for an App Store Connect upload,
 * signed automatically with the app's team. Xcode would otherwise raise
 * the build number on upload, and what ships must be kuito.config.ts's.
 */
export function exportOptions(teamId: string) {
  const entries: [string, string | boolean][] = [
    ['method', 'app-store-connect'],
    ['teamID', teamId],
    ['signingStyle', 'automatic'],
    ['destination', 'export'],
    ['manageAppVersionAndBuildNumber', false],
  ];
  const body = entries
    .map(
      ([key, value]) =>
        `  <key>${key}</key>\n  ${typeof value === 'boolean' ? `<${value}/>` : `<string>${escape(value)}</string>`}`,
    )
    .join('\n');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    `<plist version="1.0">\n<dict>\n${body}\n</dict>\n</plist>\n`
  );
}
