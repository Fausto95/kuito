#!/usr/bin/env node
/**
 * Runs the Android renderer tests (native/android/app/src/androidTest) on the
 * running emulator or device adb picks (ANDROID_SERIAL selects one).
 *
 *   node scripts/test-android.ts [gradle arguments]
 *
 * The shell only compiles with the sources the CLI generates for an app (its
 * link table and modules), so this builds the demo app's shell with
 * every module first, then runs the instrumented tests with the same
 * properties. They install under their own application id: the demo app on
 * the device stays installed. Arguments go to Gradle: pick tests with
 * `-Pandroid.testInstrumentationRunnerArguments.class=<class>`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../src/cli/config.ts';
import { shellModules } from '../src/cli/modules.ts';
import { buildAndroid, nativeDebug } from '../src/cli/platforms.ts';
import { loadProject } from '../src/cli/project.ts';
import { createRunner } from '../src/cli/runner.ts';
import { androidProperties } from '../src/cli/shells.ts';

const project = await loadProject(join(ROOT, 'demo'), 'development');
const { modules, link } = await shellModules(project.root, 'all');

await buildAndroid(createRunner(), { project, modules, link });

const dir = join(ROOT, 'native/android');
const wrapper = join(dir, 'gradlew');
const gradle = spawnSync(
  existsSync(wrapper) ? wrapper : 'gradle',
  [
    '-p',
    dir,
    ':app:connectedDebugAndroidTest',
    '--project-cache-dir',
    join(project.cache, 'android/.gradle'),
    ...androidProperties(project, modules, false, nativeDebug(process.env)),
    '-Pkuito.applicationId=dev.kuito.renderertests',
    '-Pkuito.rendererTests=true',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' },
);

process.exitCode = gradle.status ?? 1;
