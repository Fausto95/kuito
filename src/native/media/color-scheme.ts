// The color scheme styles that follow it read (docs/styles.md#conditions):
// the style compiler calls this from a stylesheet whose themes or queries
// name it, so an app whose styles never do links none of it.
import Appearance from '../../../native/modules/appearance/appearance';

export function provideColorScheme(): void {
  if (!globalThis.__kuito)
    throw new Error('Styles that follow the system require the Kuito runtime');

  globalThis.__kuito.provideMedia({ colorScheme: Appearance.colorScheme });
}
