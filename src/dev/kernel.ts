import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export const KERNEL_ENTRY = resolve(ROOT, 'src/runtime/index.ts');

/** Where `buildKernel` writes the kernel script by default. */
export const KERNEL_OUTPUT = resolve(ROOT, 'dist/kernel/bootstrap.js');

export const UI_KERNEL_ENTRY = resolve(ROOT, 'src/ui-thread/index.ts');

/** The UI-thread kernel, written beside the kernel for tests. */
export const UI_KERNEL_OUTPUT = resolve(ROOT, 'dist/kernel/ui.js');

/**
 * `dev` keeps the devtools and update causes; `release` drops
 * them at compile time and minifies. Each kernel tests `__KUITO_DEV__`, a
 * define this build replaces with a literal, so a release bundle has no
 * dev-only branch left to evaluate or even parse (docs/devtools.md#the-release-kernel).
 */
export type KernelProfile = 'dev' | 'release';

/**
 * The runtime kernel as one script for Hermes V1, which compiles ES2022; with
 * `sourcemap`, its map too, its sources absolute and no comment in the script.
 */
async function bundleScript(
  input: string,
  profile: KernelProfile,
  define: Record<string, string> = {},
  sourcemap = false,
): Promise<{ code: string; map: string | null }> {
  const { rolldown } = await import('rolldown');
  const bundle = await rolldown({
    input,
    tsconfig: false,
    transform: {
      target: 'es2022',
      define: { __KUITO_DEV__: String(profile === 'dev'), ...define },
    },
  });

  try {
    const { output } = await bundle.generate({
      format: 'iife',
      // Rolldown's default, 'dce-only', still drops the dead branches.
      minify: profile === 'release' ? true : 'dce-only',
      // Hidden: a comment would change the source, and so the UI kernel's hash.
      sourcemap: sourcemap && 'hidden',
      // What the map's sources are relative to.
      dir: ROOT,
    });

    // A map comes as an asset beside the chunk.
    const chunks = output.filter((item) => item.type === 'chunk');
    const [chunk] = chunks;

    if (chunks.length !== 1 || !chunk) throw new Error('Expected one chunk for ' + input);

    const { code, map } = chunk;

    return {
      code,
      map: map
        ? JSON.stringify({ ...map, sources: map.sources.map((source) => resolve(ROOT, source)) })
        : null,
    };
  } finally {
    await bundle.close();
  }
}

/** The UI-thread kernel (src/ui-thread), for the UI runtime's Hermes. */
export async function bundleUIKernel(profile: KernelProfile = 'dev'): Promise<string> {
  return (await bundleScript(UI_KERNEL_ENTRY, profile)).code;
}

/**
 * The SHA-1 of the UI kernel's source: what hermesc writes into the header of
 * the bytecode it compiles from it (native/shared/UIKernel.h).
 */
export function uiKernelHash(source: string): string {
  return createHash('sha1').update(source).digest('hex');
}

/**
 * The kernel names the UI kernel `ui` by hash: the first time an app needs the
 * UI thread, it asks the host to load the one it ships, which must be the one
 * built with it (docs/on-device-hermes.md#javascript-versus-hermes-bytecode).
 */
export async function bundleKernel(profile: KernelProfile = 'dev', ui?: string): Promise<string> {
  const { code } = await bundleScript(KERNEL_ENTRY, profile, {
    __KUITO_UI_KERNEL_HASH__: JSON.stringify(uiKernelHash(ui ?? (await bundleUIKernel(profile)))),
  });

  return code;
}

export interface MappedScript {
  code: string;
  map: string;
}

/**
 * Both kernels from one build, each with its map, which a release build keeps
 * for crash reports: the kernel names this UI kernel by hash.
 */
export async function bundleKernelsWithMaps(
  profile: KernelProfile,
): Promise<{ bootstrap: MappedScript; ui: MappedScript }> {
  const mapped = ({ code, map }: { code: string; map: string | null }, what: string) => {
    if (map === null) throw new Error(`The ${what} bundled without its source map`);

    return { code, map };
  };
  const ui = mapped(await bundleScript(UI_KERNEL_ENTRY, profile, {}, true), 'UI kernel');
  const bootstrap = mapped(
    await bundleScript(
      KERNEL_ENTRY,
      profile,
      { __KUITO_UI_KERNEL_HASH__: JSON.stringify(uiKernelHash(ui.code)) },
      true,
    ),
    'kernel',
  );

  return { bootstrap, ui };
}

export async function buildKernel(path = KERNEL_OUTPUT): Promise<string> {
  const ui = await bundleUIKernel();

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, await bundleKernel('dev', ui));
  await writeFile(resolve(dirname(path), 'ui.js'), ui);

  return path;
}
