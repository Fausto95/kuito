// Type plain data passed to native code.
import { defineModule, fn, type Json } from 'kuito';

// modules/analytics/analytics.ts: an event's properties cross as JSON,
// checked again on the native side.
export default defineModule('Analytics', {
  track: fn.background<(name: string, properties: Json) => Promise<void>>(),
  ios: { class: 'AnalyticsModule' },
  android: { class: 'com.example.myapp.modules.analytics.AnalyticsModule' },
});
