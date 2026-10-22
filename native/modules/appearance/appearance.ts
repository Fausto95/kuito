import { defineModule, live } from '../../../src/native/define-module';

export type ColorSchemeName = 'light' | 'dark';

// The user's light or dark mode and text size (docs/appearance.md), from the
// traits the shell reports to KuitoTraits, its own state.
export default defineModule('Appearance', {
  /** CSS's `prefers-color-scheme`; null when the platform has no preference. */
  colorScheme: live<ColorSchemeName | null>(),
  /** The text size multiplier the user chose: 1 by default. */
  fontScale: live<number>(),
  ios: { class: 'KuitoAppearanceModule' },
  android: { class: 'dev.kuito.runtime.modules.appearance.KuitoAppearanceModule' },
});
