// The settings recipe on the headless host. Persisted signals live as long
// as the file, as they do for an app's life, so these tests run in order as
// one user's session: defaults first, then their choices.
import { assert, choose, press, render, screen, test } from 'kuito/tests';
import Settings from './settings';

const stored = new Map<string, string>();

const modules = {
  Storage: {
    getString: (key: string) => stored.get(key) ?? null,
    multiSet: (entries: [string, string][]) =>
      entries.forEach(([key, text]) => stored.set(key, text)),
  },
  Localization: {
    locales: [
      {
        languageTag: 'en-US',
        languageCode: 'en',
        languageScriptCode: null,
        regionCode: 'US',
        textDirection: 'ltr',
        decimalSeparator: '.',
        digitGroupingSeparator: ',',
        measurementSystem: 'us',
        currencyCode: 'USD',
        currencySymbol: '$',
        temperatureUnit: 'fahrenheit',
      },
    ],
    calendars: [
      {
        calendar: 'gregory',
        timeZone: 'America/New_York',
        uses24hourClock: false,
        firstWeekday: 1,
      },
    ],
  },
  Appearance: { colorScheme: 'dark' },
};

test('the defaults follow the user’s region', async () => {
  await render(<Settings />, { modules });

  assert.equal(screen.getByRole('radiogroup', { name: 'Units' }).props.value, 'us');
  assert.equal(screen.getByRole('combobox', { name: 'Week starts on' }).props.value, '1');
  assert.equal(screen.getByRole('switch', { name: 'Daily reminder' }).props.checked, false);
  assert.equal(screen.getByRole('button', { name: 'Reminder time' }).props.disabled, true);
  assert.ok(screen.getByText('No reminder'));
  assert.ok(screen.getByText('Appearance: dark, from the system'));
});

test('the reminder’s time shows as the user’s clock writes it', async () => {
  await render(<Settings />, { modules });
  await press(screen.getByRole('switch', { name: 'Daily reminder' }));

  assert.equal(screen.getByRole('button', { name: 'Reminder time' }).props.disabled, false);
  assert.ok(screen.getByText(/^Every day at 8:00\sAM$/));

  await choose(screen.getByRole('button', { name: 'Reminder time' }), new Date(2026, 0, 1, 19, 30));

  assert.ok(screen.getByText(/^Every day at 7:30\sPM$/));
});

test('each choice is stored, as JSON under its key', async () => {
  await render(<Settings />, { modules });
  await choose(screen.getByRole('radiogroup', { name: 'Units' }), 'Metric');
  await choose(screen.getByRole('combobox', { name: 'Week starts on' }), 'Monday');

  assert.equal(stored.get('settings.reminders'), 'true');
  assert.equal(stored.get('settings.units'), '"metric"');
  assert.equal(stored.get('settings.weekStart'), '"2"');
});
