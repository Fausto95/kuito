/**
 * The signed format of an over-the-air update (docs/updates.md#format): a
 * manifest naming each script by its hash, the shell it fits and when it
 * was made, and an ECDSA P-256 signature over the manifest's exact bytes.
 * Both shells check the same envelope with the platform's own crypto
 * (CryptoKit, java.security), so it holds nothing they would have to
 * canonicalize: the manifest crosses as the string that was signed.
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { Platform } from './config.ts';
import type { Environment } from './signing.ts';

/** A shell refuses a manifest of another format: one it would read differently. */
export const UPDATE_FORMAT = 1;

export interface UpdateFile {
  /** Relative to the update's directory: `bootstrap.hbc`, `ui.hbc`, `app.hbc`, `app-ui.hbc` or `modules/<chunk>.hbc`. */
  path: string;
  /** Lowercase hex. */
  sha256: string;
  size: number;
}

export interface UpdateManifest {
  format: typeof UPDATE_FORMAT;
  /** Of the files' paths and hashes: the same scripts are the same update. */
  id: string;
  /** The bundle id or applicationId of the app it is for. */
  app: string;
  platform: Platform;
  /**
   * The `updates.url` it is published on: an update signed for one
   * environment's host is refused by a shell that looks at another's.
   */
  url: string;
  /** The shell it fits (src/cli/shell-fingerprint.ts). */
  fingerprint: string;
  /**
   * When it was signed, in milliseconds since 1970: a shell takes only an
   * update newer than what it runs, so an old one served again is refused.
   */
  createdAt: number;
  files: UpdateFile[];
}

export interface UpdateEnvelope {
  /** The manifest's JSON, exactly as signed. */
  manifest: string;
  /** Base64 of the DER ECDSA signature over the manifest's UTF-8 bytes, with SHA-256. */
  signature: string;
}

/** Where the private key comes from: a file outside the app, or its PEM for CI secrets. */
export const UPDATE_KEY = { path: 'KUITO_UPDATE_KEY_PATH', pem: 'KUITO_UPDATE_KEY' } as const;

const CURVE = 'prime256v1';
const HEX = /^[0-9a-f]{64}$/;
const ID = /^[0-9a-f]{16}$/;
// What a shell loads: the kernels, the root chunk, its UI bundle, and chunks by name (src/cli/device-assets.ts).
const SCRIPT =
  /^(bootstrap\.hbc|ui\.hbc|app\.hbc|app-ui\.hbc|modules\/[A-Za-z0-9_-][A-Za-z0-9._-]*\.hbc)$/;
const PLATFORMS: readonly Platform[] = ['ios', 'android'];

/** A new key pair: the private key as PEM, the public key as kuito.config.ts takes it. */
export function createKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: CURVE });

  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: publicKeyText(publicKey),
  };
}

/** Base64 SubjectPublicKeyInfo DER, which CryptoKit and X509EncodedKeySpec both read. */
export const publicKeyText = (key: KeyObject) =>
  (key.type === 'public' ? key : createPublicKey(key))
    .export({ type: 'spki', format: 'der' })
    .toString('base64');

const isP256 = (key: KeyObject) =>
  key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === CURVE;

export function parsePublicKey(text: string) {
  let key: KeyObject;

  try {
    key = createPublicKey({ key: Buffer.from(text, 'base64'), format: 'der', type: 'spki' });
  } catch {
    throw new Error('updates.publicKey is not a public key: kuito update key prints one');
  }

  if (!isP256(key)) throw new Error('updates.publicKey must be a P-256 (prime256v1) ECDSA key');

  return key;
}

/**
 * The key updates are signed with, from the environment: the PEM itself,
 * or a file. A file inside the app is refused, since what is there ends up
 * committed or packaged sooner or later.
 */
export function updateKey(root: string, env: Environment) {
  const pem = env[UPDATE_KEY.pem];
  const path = env[UPDATE_KEY.path];

  if (!pem && !path)
    throw new Error(
      `Signing an update needs its private key: set ${UPDATE_KEY.path} or ${UPDATE_KEY.pem} ` +
        '(kuito update key makes one). It never goes in the app.',
    );

  const text = pem || readKeyFile(root, path ?? '');
  let key: KeyObject;

  try {
    key = createPrivateKey(text);
  } catch {
    throw new Error(
      `${pem ? UPDATE_KEY.pem : path} holds no private key: it is the PEM kuito update key wrote`,
    );
  }

  if (!isP256(key)) throw new Error('The update key must be a P-256 (prime256v1) ECDSA key');

  return key;
}

/** Whether `path` is `root` or under it. */
export function isInside(root: string, path: string) {
  const within = relative(resolve(root), resolve(path));

  return within === '' || (!within.startsWith('..') && !isAbsolute(within));
}

/** The repository holding `root`: the nearest directory up with a `.git`, or null. */
function repositoryOf(root: string) {
  for (let directory = resolve(root); ; directory = dirname(directory)) {
    if (existsSync(join(directory, '.git'))) return directory;
    if (dirname(directory) === directory) return null;
  }
}

function readKeyFile(root: string, path: string) {
  const file = resolve(root, path);
  const repository = repositoryOf(root);

  if (isInside(root, file))
    throw new Error(
      `The update key ${file} is inside the app: move it out, and set ${UPDATE_KEY.path} to where it went.`,
    );

  if (repository !== null && isInside(repository, file))
    throw new Error(
      `The update key ${file} is inside the repository ${repository}: move it out, and set ${UPDATE_KEY.path} to where it went.`,
    );

  if (!existsSync(file)) throw new Error(`The update key ${file} does not exist`);

  return readFileSync(file, 'utf8');
}

/** An update's id: what its files are, not when it was made. */
export function updateId(files: readonly UpdateFile[]) {
  const listed = files.map(({ path, sha256 }) => `${path} ${sha256}\n`).join('');

  return createHash('sha256').update(listed).digest('hex').slice(0, 16);
}

export function signUpdate(manifest: UpdateManifest, key: KeyObject): UpdateEnvelope {
  const text = JSON.stringify(manifest);

  return {
    manifest: text,
    signature: sign('sha256', Buffer.from(text), { key, dsaEncoding: 'der' }).toString('base64'),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The manifest of an envelope whose signature `publicKey` verifies, its
 * fields checked as the shells check them. Untrusted until here.
 */
export function verifyUpdate(envelope: unknown, publicKey: KeyObject): UpdateManifest {
  if (
    !isRecord(envelope) ||
    typeof envelope.manifest !== 'string' ||
    typeof envelope.signature !== 'string' ||
    !verify(
      'sha256',
      Buffer.from(envelope.manifest),
      { key: publicKey, dsaEncoding: 'der' },
      Buffer.from(envelope.signature, 'base64'),
    )
  )
    throw new Error('The update’s signature does not verify with this public key');

  return parseManifest(JSON.parse(envelope.manifest));
}

function parseManifest(value: unknown): UpdateManifest {
  function fail(message: string): never {
    throw new Error(`Not an update manifest: ${message}`);
  }

  if (!isRecord(value)) fail('a manifest is an object');

  const { format, id, app, platform, url, fingerprint, createdAt, files } = value;

  if (format !== UPDATE_FORMAT) fail(`format ${String(format)} is not ${UPDATE_FORMAT}`);
  if (typeof id !== 'string' || !ID.test(id)) fail('id must be 16 hex digits');
  if (typeof app !== 'string' || app === '') fail('app must be an app id');

  const known = PLATFORMS.find((each) => each === platform);

  if (!known) fail('platform must be ios or android');
  if (typeof url !== 'string' || !url.startsWith('https://')) fail('url must be an https URL');

  if (typeof fingerprint !== 'string' || !HEX.test(fingerprint))
    fail('fingerprint must be 64 hex digits');

  if (typeof createdAt !== 'number' || !Number.isSafeInteger(createdAt) || createdAt <= 0)
    fail('createdAt must be a positive integer');

  if (!Array.isArray(files) || files.length === 0) fail('files must list the scripts');

  const seen = new Set<string>();
  const listed = files.map((file: unknown): UpdateFile => {
    if (!isRecord(file)) fail('each file is an object');

    const { path, sha256, size } = file;

    if (typeof path !== 'string' || !SCRIPT.test(path))
      fail(`${String(path)} is not a path a shell loads a script from`);

    if (seen.has(path)) fail(`${path} is listed twice`);
    seen.add(path);

    if (typeof sha256 !== 'string' || !HEX.test(sha256)) fail(`${path} needs its sha256`);

    if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0)
      fail(`${path} needs its size`);

    return { path, sha256, size };
  });

  return {
    format: UPDATE_FORMAT,
    id,
    app,
    platform: known,
    url,
    fingerprint,
    createdAt,
    files: listed,
  };
}
