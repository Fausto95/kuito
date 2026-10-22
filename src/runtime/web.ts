// The web APIs Kuito provides inside Hermes (docs/web-apis.md); those that
// need the platform are installed only when the native host provides it.
// src/ui/globals.d.ts declares exactly this surface for apps.
import { installAbort } from './abort';
import { installPerformance } from './clock';
import { installCrypto } from './crypto';
import { installEncoding } from './encoding';
import { installFetch } from './fetch';
import { installHeaders } from './headers';
import { host } from './host';
import { structuredClone } from './structured-clone';
import { installMicrotasks, installTimers } from './timers';
import { installUrl } from './url';
import { installWebSocket } from './websocket';

export function installWebApis(): void {
  const setTimer = host.__kuitoHostSetTimer;

  if (typeof setTimer === 'function') installTimers(setTimer);

  installMicrotasks();
  installPerformance();
  installEncoding();
  installCrypto();
  installUrl();
  host.structuredClone = structuredClone;
  installAbort();
  installHeaders();
  installFetch();
  installWebSocket();
}
