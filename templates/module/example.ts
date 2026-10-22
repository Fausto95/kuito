import { defineModule, event, fn } from 'kuito';

export type ExampleEcho = { message: string };

// The Example native module (docs/native-modules.md): this spec, and its
// Swift and Kotlin halves in ios/ and android/ beside it. A shell built for
// an app compiles in only the functions its bundle calls.
export default defineModule('Example', {
  /** Runs on the JS thread and returns at once. */
  platform: fn.sync<() => string>(),
  /** Runs on the main thread, and sends `echoed` with the message. */
  echo: fn.main<(message: string) => Promise<string>>(),
  echoed: event<ExampleEcho>(),
  ios: { class: 'ExampleModule' },
  android: { class: '{{package}}.ExampleModule' },
});
