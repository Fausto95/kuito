// Notify JavaScript when a native device connection changes.
import { defineModule, event } from 'kuito';

export default defineModule('Accessory', {
  connected: event<{ name: string }>(),
  ios: { class: 'AccessoryModule' },
  android: { class: 'com.example.modules.accessory.AccessoryModule' },
});

// Implement startConnected/stopConnected on each platform. The consumer uses
// Accessory.connected.addListener(({ name }) => console.log(name)) and calls
// remove() on the returned subscription when observation is no longer needed.
