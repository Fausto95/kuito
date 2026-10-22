import { describe, it } from 'vite-plus/test';
import { RuleTester } from 'vite-plus/lint/plugins-dev';
import plugin from '../lint/kuito-plugin.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const rule = plugin.rules['no-loop-closure'];
const captured = { messageId: 'captured' };

// Device Hermes gives `let`/`const` loop bindings one slot for the whole loop,
// so a closure made in the loop sees the last iteration's value.
new RuleTester().run('no-loop-closure', rule, {
  valid: [
    // forEach gives each iteration its own scope.
    'keys.forEach((key) => { out[key] = () => read(key); });',
    // Closures that do not use the loop binding are fine.
    'for (const key of keys) out[key] = () => read(other);',
    // Using the binding directly in the body is fine.
    'for (const key of keys) out[key] = read(key);',
    'for (let index = 0; index < 3; index++) total += index;',
  ],
  invalid: [
    { code: 'for (const key of keys) out[key] = () => read(key);', errors: [captured] },
    {
      code: 'for (const key in object) list.push(function () { return key; });',
      errors: [captured],
    },
    { code: 'for (let index = 0; index < 3; index++) later(() => index);', errors: [captured] },
    { code: 'for (const [key, value] of pairs) on(key, () => value);', errors: [captured] },
  ],
});
