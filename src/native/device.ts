import native, { type DeviceInfo } from '../../native/modules/device/device';

/** What kind of device the app runs on. */
export type DeviceType = 'unknown' | 'phone' | 'tablet' | 'desktop' | 'tv';

let info: DeviceInfo | undefined;

/** One fact, read with the rest on first use; an app that reads none never asks. */
function fact<K extends keyof DeviceInfo>(key: K): DeviceInfo[K] {
  return (info ??= native.info())[key];
}

const TYPES: readonly DeviceType[] = ['unknown', 'phone', 'tablet', 'desktop', 'tv'];

function deviceType(): DeviceType {
  return TYPES[fact('deviceType')] ?? 'unknown';
}

/** False on a simulator or emulator. */
export const physical: boolean = /* @__PURE__ */ fact('isDevice');

/** `Apple` on iOS; the consumer brand on Android, as `google`. */
export const brand: string | null = /* @__PURE__ */ fact('brand');

export const manufacturer: string | null = /* @__PURE__ */ fact('manufacturer');

/** The marketing name, as `iPhone 16 Pro` or `Pixel 8`; null for an iOS model Kuito doesn't know. */
export const model: string | null = /* @__PURE__ */ fact('modelName');

/** iOS: the hardware identifier, as `iPhone17,1`. Null on Android. */
export const modelId: string | null = /* @__PURE__ */ fact('modelId');

export const type: DeviceType = /* @__PURE__ */ deviceType();

/** Bytes of physical memory. */
export const memory: number | null = /* @__PURE__ */ fact('totalMemory');

/** `iOS`, `iPadOS` or `Android`. */
export const osName: string = /* @__PURE__ */ fact('osName');

export const osVersion: string = /* @__PURE__ */ fact('osVersion');

export const osBuildId: string | null = /* @__PURE__ */ fact('osBuildId');

/** Android's API level; null on iOS. */
export const apiLevel: number | null = /* @__PURE__ */ fact('platformApiLevel');
