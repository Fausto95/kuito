import { defineModule, fn } from '../../../src/native/define-module';

export type DeviceInfo = {
  isDevice: boolean;
  brand: string | null;
  manufacturer: string | null;
  modelName: string | null;
  modelId: string | null;
  /** expo-device's DeviceType: 0 unknown, 1 phone, 2 tablet, 3 desktop, 4 tv. */
  deviceType: number;
  totalMemory: number | null;
  osName: string;
  osVersion: string;
  osBuildId: string | null;
  platformApiLevel: number | null;
};

// The device the app runs on (docs/device.md). Read once, when the app
// starts: none of it changes while it runs. Read without UIKit or views, so
// it answers on the JS thread.
export default defineModule('Device', {
  info: fn.sync<() => DeviceInfo>(),
  ios: { class: 'KuitoDeviceModule' },
  android: { class: 'dev.kuito.runtime.modules.device.KuitoDeviceModule' },
});
