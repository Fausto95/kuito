// Observe system display settings.
import { appearance } from 'kuito';
import { render, test } from 'kuito/tests';

const dark: appearance.AppearancePreferences = { colorScheme: 'dark', fontScale: 1.3 };

test('the header reads in dark mode at a large text size', async () => {
  await render(<Header />, { modules: { Appearance: dark } });
});

function Header() {
  return null;
}
