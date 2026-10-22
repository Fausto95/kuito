// Golden tests from recordings (docs/testing.md#golden-tests): a `.krec` a
// shell saved replays through the headless renderer with no JS, and leaves
// the tree a shell prints for the same batches.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { replayBatches } from './batch.ts';
import { DEFAULT_FONTS, type FontTable } from './fonts.ts';
import { HeadlessRenderer, IPHONE_18_PRO, type Screen } from './renderer.ts';

export interface ReplayOptions {
  /** The fonts the recording's device drew with: its text sizes follow them. */
  fonts?: FontTable;
  /** The recording device's window. */
  screen?: Screen;
}

export interface Replayed {
  /** The tree the replay left, one line per view as a shell describes it. */
  tree: string;
  /** The tree the device left, saved beside the recording as `<file>.tree`; null without one. */
  recorded: string | null;
}

export async function replay(
  file: string,
  { fonts = DEFAULT_FONTS, screen = IPHONE_18_PRO }: ReplayOptions = {},
): Promise<Replayed> {
  // Rows are bound by the recording's own batches; the renderer's requests go nowhere.
  const renderer = new HeadlessRenderer(fonts, { emit() {} });

  renderer.screen = screen;

  for (const batch of replayBatches(renderer.engine.native, await readFile(file)))
    renderer.apply(batch.mutations);

  return {
    tree: renderer.describeTree(),
    recorded: existsSync(file + '.tree') ? await readFile(file + '.tree', 'utf8') : null,
  };
}
