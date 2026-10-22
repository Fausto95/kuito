import Appearance, {
  type ColorSchemeName as Scheme,
} from '../../native/modules/appearance/appearance';

export type ColorSchemeName = Scheme;

export type AppearancePreferences = {
  colorScheme: ColorSchemeName | null;
  fontScale: number;
};

// The user's light or dark mode and text size (docs/appearance.md).

/** CSS's `prefers-color-scheme`; null when the platform has no preference. */
export const colorScheme = Appearance.colorScheme;

/** The text size multiplier the user chose: 1 by default. */
export const fontScale = Appearance.fontScale;
