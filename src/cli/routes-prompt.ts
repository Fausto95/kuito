import { createElement as h } from 'react';
import { render } from 'ink';
import type { RouteStyle } from './config.ts';
import { RoutesPicker } from './session/view.ts';

/**
 * How the app `kuito create` makes routes, when `--routes` does not say: asked
 * in a terminal, file routes otherwise. Null when the user cancels.
 */
export async function chooseRoutes(name: string): Promise<RouteStyle | null> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return 'files';

  const picked = Promise.withResolvers<RouteStyle | null>();
  const instance = render(
    h(RoutesPicker, { name, onSelect: picked.resolve, onCancel: () => picked.resolve(null) }),
    { exitOnCtrlC: false },
  );
  const routes = await picked.promise;

  instance.clear();
  instance.unmount();

  return routes;
}
