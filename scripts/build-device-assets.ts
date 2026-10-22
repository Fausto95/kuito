#!/usr/bin/env node
import { parseArgs } from '../src/cli/config.ts';
import { buildDeviceAssets } from '../src/cli/device-assets.ts';
import { loadProject } from '../src/cli/project.ts';
import { PLATFORMS } from '../src/cli/config.ts';

// Run in an app's directory: its ./app, or the entry given.
const input = parseArgs(process.argv[2] ? ['--entry', process.argv[2]] : []).entry;
const project = await loadProject(process.cwd(), 'development');

// Each platform's shell gets its own bundle.
for (const platform of PLATFORMS) {
  const compiled = await buildDeviceAssets(input, project, platform);

  console.log(
    `KUITO_DEVICE_ASSETS_READY platform=${platform} entry=${input} size=${Buffer.byteLength(compiled.code)}`,
  );
}
