/*
 * Kuito's runtime kernel. Bundled into one script that Hermes compiles to
 * bytecode; it stays loaded while successive application units run.
 *
 * The host takes each job's view mutations as one batch of typed records,
 * `__kuitoHostCommit(buffer, byteLength, strings)` (src/runtime/wire.ts), and
 * sends native events back as `__kuito.dispatch(handle, event, payload)`.
 *
 * Registration and computed-property evaluation must be pure; a commit's
 * batch lands whole or not at all (src/runtime/transaction.ts).
 */
import { createApi } from './api';
import { installConsole } from './console';
import { installDevtools } from './devtools';
import { host } from './host';
import { installJsx } from './jsx';
import { installLink } from './link';
import { installThreadTags } from './threads';
import { installWebApis } from './web';

/** False in a release kernel, whose build drops what it guards (src/dev/kernel.ts). */
declare const __KUITO_DEV__: boolean;

declare global {
  var __kuito: ReturnType<typeof createApi> | undefined;
}

if (host.__kuito) throw new Error('Kuito kernel already installed');

installWebApis();
// After the timers: Hermes' rejection tracker schedules with setTimeout.
installConsole();
installJsx();
installLink();
installThreadTags();
host.__kuito = createApi();
if (__KUITO_DEV__) installDevtools();
