import native from '../../native/modules/brightness/brightness';
import type { Signal } from '../ui/reactivity';
import { report, signal, type ReadonlySignal } from './scope';

// Brightness is read on the main thread, so the signals start at null and
// hold the platform's answer once it arrives; writes show at once.
let held: { level: Signal<number | null>; system: Signal<boolean | null> } | null = null;

function current() {
  if (!held) {
    held = { level: signal<number | null>(null), system: signal<boolean | null>(null) };
    void refresh();
  }

  return held;
}

async function refresh(): Promise<void> {
  const [level, system] = await Promise.all([
    native.getBrightness(),
    native.isUsingSystemBrightness(),
  ]).catch((error: unknown) => {
    report('brightness could not be read')(error);

    return [null, null] as const;
  });

  current().level.value = level;
  current().system.value = system;
}

/**
 * From 0 to 1: the app's level if it set one, otherwise the system's; null
 * until the platform first answers. Assigning sets the app's level: a level
 * outside 0 to 1 throws a `RangeError`, and a rejected write goes through the
 * error seam.
 */
export const level: Signal<number | null> = {
  get value() {
    return current().level.value;
  },
  set value(next) {
    if (next === null || !(next >= 0 && next <= 1))
      throw new RangeError('brightness.level takes a level from 0 to 1, not ' + String(next));

    current().level.value = next;
    current().system.value = false;

    native.setBrightness(next).catch((error: unknown) => {
      report('brightness.level could not be set')(error);
      void refresh();
    });
  },
};

/** Whether the system controls brightness: the app hasn't set a level, or restored the system's. */
export const system: ReadonlySignal<boolean | null> = {
  get value() {
    return current().system.value;
  },
};

/** Hands brightness back to the system, as before the first write to `level`. */
export async function restore(): Promise<void> {
  await native.restoreSystemBrightness();
  await refresh();
}
