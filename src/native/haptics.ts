import Haptics from '../../native/modules/haptics/haptics';

export type { ImpactStyle, NotificationType } from '../../native/modules/haptics/haptics';

/** Whether the device can play haptics. Simulators and emulators cannot. */
export const supported: boolean = /* @__PURE__ */ Haptics.isSupported();

/** The tick of a picker or a segmented control changing value. */
export const selection = Haptics.selection;

/** A collision of a UI element of the given weight. */
export const impact = Haptics.impact;

/** The outcome of a task. */
export const notification = Haptics.notification;
