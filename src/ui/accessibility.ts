// The kernel's accessibility glue that `accessibility`
// (src/native/accessibility.ts) builds on.
import type { EventSubscription } from './keyboard';
import type { ElementHandle } from './refs';

export interface AccessibilityStatus {
  screenReaderEnabled: boolean;
  reduceMotionEnabled: boolean;
}

export interface AccessibilityRuntime {
  announce(message: string, options?: { queue?: boolean }): void;
  focus(target: ElementHandle): void;
  status(): AccessibilityStatus | null;
  addEventListener(
    name: 'screenReader' | 'reduceMotion',
    listener: (enabled: boolean) => void,
  ): EventSubscription;
}
