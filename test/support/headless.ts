// Apps on the headless host (src/tests, docs/testing.md) for the repo's own
// tests: compiled as the dev server compiles them, rendered with real layout.
import { dirname } from 'node:path';
import { loadCatalog } from '../../src/dev/modules/catalog.ts';
import { HeadlessHost, type RenderOptions } from '../../src/tests/host.ts';
import { compileApp } from './live-patch.ts';

/**
 * The app `entry` (a file, or an app directory of routes) running on a
 * headless host with the platform `options` describe, settled.
 */
export async function headlessApp(
  entry: string,
  options: RenderOptions = {},
): Promise<HeadlessHost> {
  const root = entry.endsWith('.tsx') ? dirname(entry) : dirname(entry.replace(/\/$/, ''));
  const host = await HeadlessHost.create({
    catalog: await loadCatalog(root),
    fonts: options.fonts,
  });

  host.configure(options);
  host.evaluate(await compileApp(entry));
  await host.settle();

  return host;
}
