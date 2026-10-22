// Why a view updated (docs/devtools.md): with devtools, each signal write
// travels with the listeners and re-plans it starts (src/runtime/signals.ts),
// so a prop write knows the write behind it. The shell's update highlighter
// names it beside the flash; the panel shows it per prop.
import { describeCause } from './devtools-graph';
import { devtools } from './state/devtools';
import { tracking } from './state/signals';
import { dict } from './values';
import { writeCommand } from './wire';

/** False in a release kernel, whose build drops what it guards (src/dev/kernel.ts). */
declare const __KUITO_DEV__: boolean;

/** Prop `prop` of view `view` is being written: remember why, and tell a highlighting shell. */
export function noteCause(view: number, prop: string): void {
  const cause = tracking.cause;

  if (!__KUITO_DEV__ || cause === null || !(devtools.updates || devtools.connected)) return;

  const noted = devtools.causes.get(view) ?? dict();
  // One write that sets several props of a view names it once.
  const named = Object.keys(noted).some((key) => noted[key] === cause);

  noted[prop] = cause;
  devtools.causes.set(view, noted);

  // The app's command, not the view's: a layout-only view has no native view to name.
  if (devtools.updates && !named)
    writeCommand(0, 'devtoolsCause', JSON.stringify([view, describeCause(cause)]));
}
