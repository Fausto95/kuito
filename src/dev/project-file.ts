import { realpathSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';

/**
 * `path` resolved, if it is an existing file inside `root` once symlinks are
 * followed: a link inside the project must not reach a file outside it.
 */
export function projectFile(root: string, path: string): string | undefined {
  if (!isAbsolute(path)) return undefined;

  try {
    const real = realpathSync(path);
    const inside = relative(realpathSync(root), real);

    return inside && !inside.startsWith('..') && !isAbsolute(inside) ? real : undefined;
  } catch {
    // A path that does not resolve (missing, a loop, too long) is no file to
    // serve or open; a device names these, so it must not stop the server.
    return undefined;
  }
}
