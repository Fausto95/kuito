import type { startLiveServer } from '../../src/cli/dev.ts';
import type { Device } from '../../src/cli/devices.ts';
import type { Runner } from '../../src/cli/runner.ts';

export type RunOptions = NonNullable<Parameters<Runner['run']>[2]>;

export type ServerSpawn = NonNullable<Parameters<typeof startLiveServer>[0]['spawnImpl']>;

/**
 * Device fixtures carry only the fields the code under test reads. Filling the
 * rest with placeholders would change what it does (`active`, `label`, ...), so
 * the partial fixture is passed through as the full type.
 */
export function fixtureDevice(fields: Partial<Device>): Device {
  return fields as never;
}
