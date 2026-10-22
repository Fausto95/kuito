/**
 * Crash reports from release shells (docs/crash-reports.md): the shape both
 * shells write, the source maps a release build keeps for them, and their
 * symbolication back to the app's source.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import { kindOf, parseStack, type SourceFrame, type StackFrame } from '../dev/symbolicate.ts';
import type { Platform } from './config.ts';
import type { Project } from './project.ts';

export interface CrashReport {
  id: string;
  /** A JavaScript error, or a crash of the native process. */
  kind: 'javascript' | 'native';
  /** Whether the app stopped: a native crash, or a script that failed to run. */
  fatal: boolean;
  message: string;
  /** As the engine or the platform printed it. */
  stack: string;
  /** ISO 8601. */
  time: string;
  /**
   * The build that crashed: its bundle id, version and build number, and
   * the over-the-air update it ran, null for the bytecode it shipped with.
   */
  app: { id: string; version: string; build: string; update: string | null };
  platform: Platform;
  os: string;
  device: string;
}

/** Every key a report holds, the app's included: both shells write each one. */
export const CRASH_REPORT_KEYS = [
  'id',
  'kind',
  'fatal',
  'message',
  'stack',
  'time',
  'app',
  'version',
  'build',
  'update',
  'platform',
  'os',
  'device',
] as const;

const KINDS = ['javascript', 'native'] as const;
const PLATFORMS = ['ios', 'android'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A report as a shell or a hosted service passed it on: untrusted until here. */
export function parseCrashReport(value: unknown): CrashReport {
  if (!isRecord(value)) throw new Error('Not a crash report: a crash report is an object');

  const text = (record: Record<string, unknown>, key: string, at = key) => {
    const found = record[key];

    if (typeof found !== 'string') throw new Error(`Not a crash report: ${at} must be a string`);

    return found;
  };
  const kind = KINDS.find((each) => each === value.kind);
  const platform = PLATFORMS.find((each) => each === value.platform);
  const { app } = value;

  if (!kind) throw new Error('Not a crash report: kind must be javascript or native');
  if (!platform) throw new Error('Not a crash report: platform must be ios or android');

  if (typeof value.fatal !== 'boolean')
    throw new Error('Not a crash report: fatal must be true or false');

  if (!isRecord(app)) throw new Error('Not a crash report: app must be an object');

  return {
    id: text(value, 'id'),
    kind,
    fatal: value.fatal,
    message: text(value, 'message'),
    stack: text(value, 'stack'),
    time: text(value, 'time'),
    app: {
      id: text(app, 'id', 'app.id'),
      version: text(app, 'version', 'app.version'),
      build: text(app, 'build', 'app.build'),
      update: app.update === undefined ? null : text(app, 'update', 'app.update'),
    },
    platform,
    os: text(value, 'os'),
    device: text(value, 'device'),
  };
}

/** Where a release build keeps its maps: by platform, version and build number, as reports name them. */
export const sourceMapDirectory = (
  { cache }: Pick<Project, 'cache'>,
  platform: Platform,
  version: string,
  build: string,
) => join(cache, 'sourcemaps', platform, `${version}-${build}`);

/** Where `kuito update build` keeps an update's maps: by its id, which its reports name. */
export const updateSourceMapDirectory = (
  { cache }: Pick<Project, 'cache'>,
  platform: Platform,
  update: string,
) => join(cache, 'sourcemaps', platform, `update-${update}`);

/** The maps of the bytecode a report's app ran, and the command that keeps them. */
const mapsOf = (report: CrashReport, project: Pick<Project, 'cache'>) =>
  report.app.update === null
    ? {
        directory: sourceMapDirectory(
          project,
          report.platform,
          report.app.version,
          report.app.build,
        ),
        what: `${report.platform} ${report.app.version} (${report.app.build})`,
        command: 'kuito build --profile release',
        kept: 'every build you ship',
      }
    : {
        directory: updateSourceMapDirectory(project, report.platform, report.app.update),
        what: `the ${report.platform} update ${report.app.update}`,
        command: 'kuito update build',
        kept: 'every update you publish',
      };

/** A bundle map with its sources relative to the project, from one relative to `directory`. */
export function projectSources(map: string, directory: string, root: string) {
  const parsed: unknown = JSON.parse(map);

  if (!isRecord(parsed) || !Array.isArray(parsed.sources)) throw new Error('Not a source map');

  return JSON.stringify({
    ...parsed,
    sources: parsed.sources.map((source: unknown) =>
      typeof source === 'string'
        ? relative(root, resolve(directory, source)).split(sep).join('/')
        : source,
    ),
  });
}

/**
 * `map` with each source as an absolute path, resolved from `directory`: a map
 * written beside its script under `.kuito/mobile`, read wherever it is.
 */
export function absoluteSources(map: string, directory: string) {
  const parsed: unknown = JSON.parse(map);

  if (!isRecord(parsed) || !Array.isArray(parsed.sources)) throw new Error('Not a source map');

  return JSON.stringify({
    ...parsed,
    sources: parsed.sources.map((source: unknown) =>
      typeof source === 'string' ? resolve(directory, source) : source,
    ),
  });
}

/**
 * The kept maps' name for the script a frame's URL names: `app` for the
 * root chunk, `modules/<name>` for a chunk loaded by name, `app-ui` for the
 * app's UI bundle (`kuito://ui/<hash>`), and `ui` and `bootstrap` for the
 * two kernels, whose frames resolve to Kuito's own files.
 */
function scriptOf(url: string) {
  if (url === 'kuito://app') return 'app';
  if (url === 'kuito://ui-kernel') return 'ui';
  if (url === 'kuito://bootstrap') return 'bootstrap';
  if (url.startsWith('kuito://ui/')) return 'app-ui';

  if (url.startsWith('kuito://modules/')) return 'modules/' + url.slice('kuito://modules/'.length);

  return null;
}

interface Script {
  bytecode: TraceMap;
  bundle: TraceMap;
}

/**
 * A report's message and frames, mapped to the app's source. A release
 * stack names a bytecode offset as its column (`address at
 * kuito://app:1:<offset>`): Hermes's map takes it to the bundle, and the
 * bundle's map to the file the app wrote. Native frames stay as printed.
 */
export function symbolicateReport(report: CrashReport, project: Pick<Project, 'root' | 'cache'>) {
  const { directory, what, command, kept } = mapsOf(report, project);

  if (!existsSync(directory))
    throw new Error(
      `No source maps for ${what} at ${directory}: ` +
        `${command} writes them there; keep that directory for ${kept}.`,
    );

  const scripts = new Map<string, Script | null>();
  const scriptFor = (name: string) => {
    if (!scripts.has(name)) {
      const [bytecode, bundle] = [`${name}.hbc.map`, `${name}.js.map`].map((file) => {
        const path = join(directory, file);

        if (!existsSync(path))
          throw new Error(
            `${path} is missing: the maps of a build are kept together, as it wrote them.`,
          );

        return new TraceMap(readFileSync(path, 'utf8'));
      });

      scripts.set(name, bytecode && bundle ? { bytecode, bundle } : null);
    }

    return scripts.get(name) ?? null;
  };

  const frame = ({ name, url, line, column }: StackFrame): SourceFrame => {
    if (line === undefined || column === undefined) return { name, kind: 'native' };

    const script = scriptOf(url);
    const maps = script === null ? null : scriptFor(script);

    if (!maps) return { name, kind: 'app' };

    const inBundle = originalPositionFor(maps.bytecode, { line, column });

    if (inBundle.line === null) return { name, kind: 'kuito' };

    const source = originalPositionFor(maps.bundle, {
      line: inBundle.line,
      column: inBundle.column,
    });

    // Code the bundler wrote, like the entry wrapper.
    if (source.source === null) return { name, kind: 'kuito' };

    return {
      name,
      kind: kindOf(resolve(project.root, source.source)),
      file: source.source,
      line: source.line,
      column: source.column + 1,
    };
  };

  return {
    message: report.message,
    // A native stack is the platform's own: dSYMs and R8 mappings resolve it, not these maps.
    frames: report.kind === 'javascript' ? parseStack(report.stack).map(frame) : [],
  };
}
