import { createSourceCompiler } from '../dev/compiler.ts';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { bundleKernelsWithMaps, type KernelProfile } from '../dev/kernel.ts';
import { resolve } from 'node:path';
import { compileBytecode } from './hermesc.ts';
import { absoluteSources, projectSources, sourceMapDirectory } from './crash-reports.ts';
import type { Platform, Profile } from './config.ts';
import type { Project } from './project.ts';

/** Where each shell keeps the app's chunks, one bytecode file each, loaded by name. */
const MODULES: Record<Platform, string> = {
  ios: 'ios/Modules',
  android: 'android/assets/kuito/modules',
};

/** Where each shell keeps the kernel and the root chunk. */
const SHELLS: Record<Platform, string> = { ios: 'ios/Resources', android: 'android/assets/kuito' };

const KERNELS: Record<Profile, KernelProfile> = { debug: 'dev', release: 'release' };

/** Whether the shell carries the app's source: only one that takes Live Patches needs it. */
const SOURCES: Record<Profile, boolean> = { debug: true, release: false };

/**
 * Whether the app's UI bundle ships as bytecode, `app-ui.hbc`: a debug shell
 * takes Live Patches, whose UI bundles come as source, so its first does too.
 */
const SHIPPED_UI: Record<Profile, boolean> = { debug: false, release: true };

export interface AssetOptions {
  profile?: Profile;
  /**
   * Compiles one script to bytecode; the pinned hermesc by default. A
   * release compile writes the bytecode's map beside it, as `<output>.map`.
   */
  compile?: (source: string, output: string, profile: Profile) => Promise<void>;
}

/** A script a shell loads, by its path under the shell's bundle directory, and where it was compiled. */
export interface DeviceScript {
  /** `bootstrap.hbc`, `ui.hbc`, `app.hbc`, `app-ui.hbc` or `modules/<chunk>.hbc`, as an update names it too. */
  path: string;
  file: string;
}

/**
 * The kernels and the app compiled to bytecode for one platform, in the
 * project's scratch directory: what a shell starts with, and what an update
 * replaces (docs/updates.md). Each platform gets its own bundle, without the
 * other's branches. Both platforms link the same Hermes V1 and start from
 * its bytecode (docs/performance.md): `ui.hbc` is the UI kernel the kernel
 * names by hash, loaded the first time the app needs the UI thread,
 * `app.hbc` starts the root chunk, a release build's `app-ui.hbc` is the
 * app's UI bundle, which the root chunk names by hash, and every other chunk
 * is a file of its own the shell evaluates the first time the app requires
 * it (docs/navigation.md#route-modules). A release compile uses the release
 * kernel and release bytecode.
 */
export async function compileDeviceScripts(
  entry: string,
  project: Project,
  platform: Platform,
  { profile = 'debug', compile = compileBytecode }: AssetOptions = {},
) {
  const scratch = resolve(project.cache, 'mobile', platform);
  const compiled = await createSourceCompiler({
    platform,
    outputDir: scratch,
    root: project.root,
    strict: project.config.strict,
    shippedUI: SHIPPED_UI[profile],
  })(entry);
  const kernelSource = resolve(scratch, 'bootstrap.js');
  const uiSource = resolve(scratch, 'ui.js');
  const startSource = resolve(scratch, 'start.js');
  const appUISource = resolve(scratch, 'app-ui.js');
  const chunkScratch = resolve(scratch, 'modules');

  // Chunks are named by content: a previous build's would linger.
  await rm(chunkScratch, { recursive: true, force: true });
  await mkdir(chunkScratch, { recursive: true });

  const kernels = await bundleKernelsWithMaps(KERNELS[profile]);

  // A debug shell names its bytecode by these scripts, so a frame on the device
  // names one: the dev server maps it through the map beside it (src/dev/symbolicate.ts).
  const script = async (path: string, code: string, map: string | null) => {
    await writeFile(path, code);
    if (map) await writeFile(path + '.map', absoluteSources(map, scratch));
  };

  await script(kernelSource, kernels.bootstrap.code, kernels.bootstrap.map);
  await script(uiSource, kernels.ui.code, kernels.ui.map);
  await script(startSource, compiled.start, compiled.startMap);

  // One after the other: the first call may download the compiler.
  await compile(kernelSource, resolve(scratch, 'bootstrap.hbc'), profile);
  await compile(uiSource, resolve(scratch, 'ui.hbc'), profile);
  await compile(startSource, resolve(scratch, 'app.hbc'), profile);

  if (SHIPPED_UI[profile]) {
    await script(appUISource, compiled.ui, compiled.uiMap);
    await compile(appUISource, resolve(scratch, 'app-ui.hbc'), profile);
  }

  for (const chunk of compiled.chunks) {
    const source = resolve(chunkScratch, chunk.name + '.js');

    await script(source, chunk.code, chunk.map);
    await compile(source, resolve(chunkScratch, chunk.name + '.hbc'), profile);
  }

  const scripts: DeviceScript[] = [
    { path: 'bootstrap.hbc', file: resolve(scratch, 'bootstrap.hbc') },
    { path: 'ui.hbc', file: resolve(scratch, 'ui.hbc') },
    { path: 'app.hbc', file: resolve(scratch, 'app.hbc') },
    ...(SHIPPED_UI[profile] ? [{ path: 'app-ui.hbc', file: resolve(scratch, 'app-ui.hbc') }] : []),
    ...compiled.chunks.map((chunk) => ({
      path: `modules/${chunk.name}.hbc`,
      file: resolve(chunkScratch, chunk.name + '.hbc'),
    })),
  ];

  const kernelMaps = { bootstrap: kernels.bootstrap.map, ui: kernels.ui.map };

  return { compiled, scratch, scripts, kernelMaps };
}

/**
 * The kernels and the app a platform's shell starts with, written into the
 * shell generated in the project's `.kuito/` (src/cli/shells.ts). In a
 * debug build the app's source rides along only to recognize a Live Patch
 * it already runs. A release build carries no source, and keeps its maps
 * for `kuito symbolicate`.
 */
export async function buildDeviceAssets(
  entry: string,
  project: Project,
  platform: Platform,
  options: AssetOptions = {},
) {
  const { profile = 'debug' } = options;
  const { compiled, scratch, kernelMaps } = await compileDeviceScripts(
    entry,
    project,
    platform,
    options,
  );
  const shell = resolve(project.cache, SHELLS[platform]);
  const modules = resolve(project.cache, MODULES[platform]);

  await rm(modules, { recursive: true, force: true });
  await Promise.all([shell, modules].map((directory) => mkdir(directory, { recursive: true })));

  await Promise.all([
    copyFile(resolve(scratch, 'bootstrap.hbc'), resolve(shell, 'bootstrap.hbc')),
    copyFile(resolve(scratch, 'ui.hbc'), resolve(shell, 'ui.hbc')),
    copyFile(resolve(scratch, 'app.hbc'), resolve(shell, 'app.hbc')),
    SHIPPED_UI[profile]
      ? copyFile(resolve(scratch, 'app-ui.hbc'), resolve(shell, 'app-ui.hbc'))
      : rm(resolve(shell, 'app-ui.hbc'), { force: true }),
    SOURCES[profile]
      ? writeFile(resolve(shell, 'app.js'), compiled.code)
      : rm(resolve(shell, 'app.js'), { force: true }),
    rm(resolve(shell, 'bootstrap.js'), { force: true }),
    ...compiled.chunks.map((chunk) =>
      copyFile(
        resolve(scratch, 'modules', chunk.name + '.hbc'),
        resolve(modules, chunk.name + '.hbc'),
      ),
    ),
  ]);

  if (profile === 'release') {
    const { version, buildNumber } = project.config;

    await keepSourceMaps(
      project,
      sourceMapDirectory(project, platform, version, String(buildNumber)),
      scratch,
      compiled,
      kernelMaps,
    );
  }

  return compiled;
}

/**
 * A release compile's maps, kept in `directory`, where `kuito symbolicate`
 * looks for them, and never in the shell, which would hand out the app's
 * source: for each script, Hermes's map from bytecode offsets to the
 * bundle, and the bundle's map to the project's files. Both kernels keep
 * theirs too: their frames resolve to Kuito's own files.
 */
export async function keepSourceMaps(
  project: Pick<Project, 'root'>,
  directory: string,
  scratch: string,
  compiled: {
    startMap: string | null;
    uiMap: string;
    chunks: { name: string; map: string | null }[];
  },
  kernelMaps: { bootstrap: string; ui: string },
) {
  const scripts = [
    { name: 'app', bytecode: resolve(scratch, 'app.hbc'), map: compiled.startMap },
    { name: 'app-ui', bytecode: resolve(scratch, 'app-ui.hbc'), map: compiled.uiMap },
    { name: 'ui', bytecode: resolve(scratch, 'ui.hbc'), map: kernelMaps.ui },
    { name: 'bootstrap', bytecode: resolve(scratch, 'bootstrap.hbc'), map: kernelMaps.bootstrap },
    ...compiled.chunks.map((chunk) => ({
      name: 'modules/' + chunk.name,
      bytecode: resolve(scratch, 'modules', chunk.name + '.hbc'),
      map: chunk.map,
    })),
  ];

  await rm(directory, { recursive: true, force: true });
  await mkdir(resolve(directory, 'modules'), { recursive: true });

  await Promise.all(
    scripts.flatMap(({ name, bytecode, map }) => [
      copyFile(bytecode + '.map', resolve(directory, name + '.hbc.map')),
      ...(map
        ? [
            writeFile(
              resolve(directory, name + '.js.map'),
              projectSources(map, scratch, project.root),
            ),
          ]
        : []),
    ]),
  );
}
