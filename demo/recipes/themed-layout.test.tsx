// The themed layout recipe on the headless host: its words in the user's
// language, its rows mirrored for a right-to-left one, its colors from the
// color scheme and its badge's growth capped.
import { assert, press, render, screen, test, within } from 'kuito/tests';
import ThemedLayout from './themed-layout';

const locale = (languageTag: string, textDirection: 'ltr' | 'rtl') => [
  {
    languageTag,
    languageCode: languageTag.slice(0, 2),
    languageScriptCode: null,
    regionCode: null,
    textDirection,
    decimalSeparator: '.',
    digitGroupingSeparator: ',',
    measurementSystem: 'metric',
    currencyCode: null,
    currencySymbol: '',
    temperatureUnit: 'celsius',
  },
];

const english = locale('en-GB', 'ltr');
const arabic = locale('ar-EG', 'rtl');

/**
 * Renders the screen for a user of `locales`. A live value lasts for the
 * file, as for an app's life, so a change of language is the platform's
 * event, sent after the render.
 */
async function renderIn(locales: typeof english, colorScheme: 'light' | 'dark' = 'light') {
  const app = await render(<ThemedLayout />, { modules: { Localization: { locales: english } } });

  await app.emit('Localization', 'locales', locales);
  await app.emit('Appearance', 'colorScheme', colorScheme);

  return app;
}

/** The row of the thread `name`. */
const row = (name: string) => screen.getByRole('img', { name }).parent;

test('English words, with the unread count in its plural', async () => {
  await renderIn(english);

  assert.ok(screen.getByText('Inbox'));
  assert.ok(screen.getByText('Hello, Ada!'));
  assert.ok(screen.getByText('3 unread messages'));
});

test('Arabic words, with its own plural for three', async () => {
  await renderIn(arabic);

  assert.ok(screen.getByText('البريد الوارد'));
  assert.ok(screen.getByText(/^\S+ رسائل غير مقروءة$/), 'the plural’s few branch');
});

// A row's margin-inline (16) and padding-inline-start (16) put its avatar
// 32 points in from the side its language starts at.
test('rows start at the left in English and at the right in Arabic', async () => {
  await renderIn(english);

  const ltr = within(row('Ada') ?? assert.fail('no row')).getByRole('img').windowFrame;

  assert.equal(ltr.x, 32);

  await renderIn(arabic);

  const rtl = within(row('Ada') ?? assert.fail('no row')).getByRole('img').windowFrame;

  assert.equal(402 - (rtl.x + rtl.width), 32);
});

test('the switch previews the other direction', async () => {
  await renderIn(english);

  const before = screen.getByRole('img', { name: 'Ada' }).windowFrame.x;

  await press(screen.getByRole('switch', { name: 'Right to left' }));

  assert.ok(screen.getByRole('img', { name: 'Ada' }).windowFrame.x > before);
});

test('the dark scheme swaps the tokens', async () => {
  await renderIn(english, 'light');

  const light = row('Ada')?.props.backgroundColor;

  await renderIn(english, 'dark');

  assert.notEqual(row('Ada')?.props.backgroundColor, light);
});

test('the badge may grow with the user’s text size, up to 1.3 times', async () => {
  await renderIn(english);

  const ada = row('Ada');

  assert.ok(ada);
  assert.equal(within(ada).getByText('2').props.maxFontScale, 1.3);
});
