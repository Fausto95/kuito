// Live Patch server output: one event object per stdout line, which
// `kuito dev` reads.

import type { Diagnostic } from './compiler.ts';
import type { BundledAsset } from './assets.ts';
import type { ConsoleEntry, DeviceLink } from './device-server.ts';
import type { NativeModuleUse } from './modules/catalog.ts';
import type { PlacementFile } from './transform.ts';

interface Patch {
  ms?: number;
  files?: string[];
  entry?: string;
}

interface DeviceAck {
  device: DeviceLink;
  revision: number;
}

interface Reporter {
  ready(event: { url: string }): void;
  /**
   * A revision went out to `delivered` devices. `nativeModules`, `links`
   * and `assets`: what it requires, calls and imports, so `kuito dev` can
   * rebuild a shell that lacks one.
   */
  patched(
    event: Patch & {
      revision: number;
      ms: number;
      initial: boolean;
      delivered: number;
      nativeModules?: NativeModuleUse[];
      links?: number[];
      linkHash?: string;
      assets?: BundledAsset[];
    },
  ): void;
  /** A rebuild produced the last revision's output again; nothing was sent. */
  unchanged(event: Patch): void;
  rejected(event: Patch & { message: string; diagnostics?: Diagnostic[] }): void;
  deviceConnected(event: { device: DeviceLink }): void;
  deviceDisconnected(event: { device: DeviceLink }): void;
  /** `ms`: evaluating it on the device; `latency`: from the edit to this ack. */
  deviceApplied(event: DeviceAck & { ms: number; latency?: number }): void;
  deviceRejected(event: DeviceAck & { code: string; message: string }): void;
  error(event: { source: string; message: string }): void;
  state(event: { key: string; value: unknown }): void;
  started(event?: { entry?: string }): void;
  console(event: ConsoleEntry): void;
  /** Where the compiler placed the code of each file whose report changed (docs/placement.md). */
  placement(event: { files: PlacementFile[] }): void;
  /** Chrome DevTools opened on the runtime `title` names. */
  debugger(event: { title: string }): void;
  /** A shell's recording was saved to `file`. */
  recorded(event: { device: DeviceLink; file: string; bytes: number; truncated: boolean }): void;
}

export function createReporter({
  out = console.log,
}: { out?: (line: string) => void } = {}): Reporter {
  const line = (type: string) => (event?: object) => out(JSON.stringify({ type, ...event }));

  return {
    ready: line('ready'),
    patched: line('patched'),
    unchanged: line('unchanged'),
    rejected: line('rejected'),
    deviceConnected: line('device:connected'),
    deviceDisconnected: line('device:disconnected'),
    deviceApplied: line('device:applied'),
    deviceRejected: line('device:rejected'),
    error: line('error'),
    state: line('state'),
    started: line('started'),
    console: line('console'),
    placement: line('placement'),
    debugger: line('debugger'),
    recorded: line('recorded'),
  };
}
