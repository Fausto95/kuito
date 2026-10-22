// What building a Kuito app needs on the host. Each version is stated once:
// Node's minimum in package.json's `engines`, the rest here. `kuito doctor`
// and `kuito help` read them from this module.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './config.ts';
import { hasAdb } from './devices.ts';
import { hasTool, type Runner } from './runner.ts';

/** The JDK Gradle runs on for the Android shell. */
export const JDK = 21;

/** Gradle's major version: the Android Gradle plugin the shell uses does not run on 9. */
export const GRADLE = 8;

const engines: unknown = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).engines;

function nodeMinimum(): string {
  const range =
    typeof engines === 'object' && engines !== null && 'node' in engines ? engines.node : null;
  const minimum = typeof range === 'string' ? /^>=\s*(\d+(?:\.\d+)*)$/.exec(range)?.[1] : null;

  if (!minimum)
    throw new Error(`package.json: engines.node must be ">=<version>", not ${String(range)}`);

  return minimum;
}

/** The oldest Node.js `kuito` runs on. */
export const NODE = nodeMinimum();

const parts = (version: string) => version.split('.').map(Number);

/** Whether `version` is at least `minimum`, both dotted numbers. */
export function atLeast(version: string, minimum: string): boolean {
  const have = parts(version);

  for (const [index, want] of parts(minimum).entries()) {
    const part = have[index] ?? 0;

    if (part !== want) return part > want;
  }

  return true;
}

/** The major version a tool prints, or null when it is missing or says nothing usable. */
async function majorVersion(runner: Runner, bin: string, args: string[], pattern: RegExp) {
  try {
    const { stdout, stderr } = await runner.run(bin, args, { timeoutMs: 20_000 });
    const major = pattern.exec(stderr + stdout)?.[1];

    return major === undefined ? null : Number(major);
  } catch {
    return null;
  }
}

export interface Check {
  name: string;
  ok: boolean;
  fix: string;
}

const found = (tool: string, major: number | null) =>
  major === null ? '' : `Found ${tool} ${major}. `;

async function jdk(runner: Runner): Promise<Check> {
  const home = process.env.JAVA_HOME;
  const major = await majorVersion(
    runner,
    home ? join(home, 'bin/java') : 'java',
    ['-version'],
    /version "(?:1\.)?(\d+)/,
  );

  return {
    name: `JDK ${JDK}`,
    ok: major !== null && major >= JDK,
    fix: `${found('JDK', major)}Install JDK ${JDK} and point JAVA_HOME at it`,
  };
}

async function gradle(runner: Runner): Promise<Check> {
  const name = `Gradle ${GRADLE}`;

  if (existsSync(join(ROOT, 'native/android/gradlew'))) return { name, ok: true, fix: '' };

  const major = await majorVersion(runner, 'gradle', ['--version'], /Gradle (\d+)/);

  return {
    name,
    ok: major === GRADLE,
    fix: `${found('Gradle', major)}Install Gradle ${GRADLE} (brew install gradle@${GRADLE}) and put it first on PATH`,
  };
}

/** Everything `kuito doctor` checks: what `kuito build` and `kuito dev` run. */
export async function checkHost(runner: Runner): Promise<Check[]> {
  const mac = process.platform === 'darwin';

  return [
    {
      name: `Node.js >= ${NODE}`,
      ok: atLeast(process.versions.node, NODE),
      fix: `Install Node.js ${NODE} or newer`,
    },
    {
      name: 'Xcode command-line tools',
      ok: mac && (await hasTool(runner, 'xcodebuild')),
      fix: 'Install Xcode and run xcode-select --install (macOS only)',
    },
    { name: 'XcodeGen', ok: await hasTool(runner, 'xcodegen'), fix: 'brew install xcodegen' },
    {
      name: 'Android SDK (adb)',
      ok: await hasAdb(runner),
      fix: 'Install Android SDK Platform-Tools and set ANDROID_HOME (or add adb to PATH)',
    },
    await jdk(runner),
    await gradle(runner),
  ];
}
