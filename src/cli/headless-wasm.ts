/**
 * The shells' shared C++ the headless host runs (docs/testing.md), compiled
 * to WebAssembly: the layout engine (native/shared/layout) and the batch
 * decoding and checks (Wire.h, ViewTable, Recording.h). The module is
 * checked in, so an app's tests need no C++ toolchain;
 * `node scripts/build-headless-wasm.ts` rebuilds it with the pinned wasi-sdk,
 * downloaded into ~/.cache/kuito on first use, and records the hash of
 * what it was built from.
 */
import { createHash } from 'node:crypto';
import { chmod, readdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { HEADLESS_WASM } from '../tests/wasm.ts';
import { ROOT } from './config.ts';
import { type Digest, download, exists, fillCache, run, verifyPinned } from './hermesc.ts';

const WASI_SDK_VERSION = '34';

/** Each host's archive, by `${process.platform}-${process.arch}`, and its pinned SHA-256. */
const WASI_SDK: Readonly<Record<string, { archive: string; sha256: string }>> = {
  'darwin-arm64': {
    archive: 'arm64-macos',
    sha256: '9c59398106b417f8f14913380fdf0097a8cc0ff4af9eb3ce0065a859e88d49e9',
  },
  'darwin-x64': {
    archive: 'x86_64-macos',
    sha256: '87d27fa8adc68dee59bfbf2e22a6d34ef717c34d6bf1d8af2a56fc929d9ce0eb',
  },
  'linux-arm64': {
    archive: 'arm64-linux',
    sha256: 'f7e243dff54d60bcc576e94d6166b69f410f2500ae4a9ceef34315be10e77971',
  },
  'linux-x64': {
    archive: 'x86_64-linux',
    sha256: 'b761e3a0721dbae9c09a0059e5fdb2bf917d1b4a8a7b430fb3b5aafb0984b2c4',
  },
};

/** What the module was built from: `inputs` is the hash `headlessInputs` gives. */
export const HEADLESS_WASM_PIN = join(ROOT, 'native/headless/headless.json');

/** The engine and the checks as the shells compile them, and the bindings the host calls. */
const SOURCES = [
  'native/shared/layout/FlexLayout.cpp',
  'native/shared/layout/Flexbox.cpp',
  'native/shared/layout/Absolute.cpp',
  'native/shared/layout/Balance.cpp',
  'native/shared/layout/KuitoLayoutStyle.cpp',
  'native/shared/ViewTable.cpp',
  'native/headless/LayoutWasm.cpp',
  'native/headless/BatchWasm.cpp',
];

const SHARED_HEADERS = [
  'Instruments.h',
  'Mutation.h',
  'PropKeys.generated.h',
  'Recording.h',
  'ViewTable.h',
  'Wire.h',
].map((file) => `native/shared/${file}`);

// Exceptions use Wasm's exception handling, which Node runs natively: the
// engine and the decoder reject what is invalid by throwing, as on the
// devices. A reactor has no main; the host calls `_initialize` once.
// Node 22's V8 runs only the legacy encoding of exceptions, not exnref, which
// wasi-sdk emits by default and its prebuilt libc++ already holds. LTO links
// libc++ from the sysroot's bitcode instead, so the linker generates all the
// code; it takes the exception options the compiler would otherwise have.
const FLAGS = [
  '--target=wasm32-wasip1',
  '-std=c++17',
  '-O2',
  '-Wall',
  '-Wextra',
  '-Werror',
  '-fwasm-exceptions',
  '-flto',
  '-mexec-model=reactor',
];

const LINK_FLAGS = [
  '-lunwind',
  '-Wl,-mllvm,-wasm-enable-eh',
  '-Wl,-mllvm,-exception-model=wasm',
  '-Wl,-mllvm,-wasm-use-legacy-eh',
  '-Wl,--strip-all',
];

/** A hash of every input and flag of the build: the pin a stale module fails against. */
export async function headlessInputs(): Promise<string> {
  const layout = (await readdir(join(ROOT, 'native/shared/layout')))
    .filter((file) => /\.(h|cpp)$/.test(file))
    .map((file) => `native/shared/layout/${file}`);
  const files = [...new Set([...SOURCES, ...SHARED_HEADERS, ...layout])].sort();
  const hash = createHash('sha256').update(JSON.stringify([WASI_SDK_VERSION, FLAGS, LINK_FLAGS]));

  for (const file of files) hash.update(file).update(await readFile(join(ROOT, file)));

  return hash.digest('hex');
}

const SHA256: Digest = {
  name: 'SHA-256',
  of: (bytes) => createHash('sha256').update(bytes).digest('hex'),
};

/** The pinned wasi-sdk, downloaded and unpacked on first use. */
async function wasiSdk(): Promise<string> {
  const directory = join(homedir(), '.cache', 'kuito', `wasi-sdk-${WASI_SDK_VERSION}`);
  const host = `${process.platform}-${process.arch}`;

  if (await exists(join(directory, 'bin/clang++'))) return directory;

  const pin = WASI_SDK[host];

  if (!pin) throw new Error(`wasi-sdk has no pinned build for ${host}`);

  const url =
    `https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${WASI_SDK_VERSION}/` +
    `wasi-sdk-${WASI_SDK_VERSION}.0-${pin.archive}.tar.gz`;
  const tarball = verifyPinned(await download(url, 'wasi-sdk'), SHA256, pin.sha256, url);

  await fillCache(directory, async (staging) => {
    const file = join(staging, 'wasi-sdk.tar.gz');

    await writeFile(file, tarball);
    await run('tar', ['-xzf', file, '-C', staging, '--strip-components=1']);
    await run('rm', [file]);
  });

  return directory;
}

/** Compiles the module into native/headless and pins what it was built from. */
export async function buildHeadlessWasm(): Promise<string> {
  const sdk = await wasiSdk();

  await run(join(sdk, 'bin/clang++'), [
    ...FLAGS,
    '-I',
    join(ROOT, 'native/shared'),
    ...SOURCES.map((file) => join(ROOT, file)),
    ...LINK_FLAGS,
    '-o',
    HEADLESS_WASM,
  ]);

  // The linker marks its output executable; the module is data.
  await chmod(HEADLESS_WASM, 0o644);

  await writeFile(
    HEADLESS_WASM_PIN,
    JSON.stringify({ inputs: await headlessInputs() }, null, 2) + '\n',
  );

  return HEADLESS_WASM;
}
