import type { TextFieldProps } from 'kuito';
import { colors } from './theme';

/** The look the account sheets' fields share: `<TextField {...field} />`. */
export const field = {
  padding: 12,
  borderRadius: 10,
  backgroundColor: colors.background,
  color: colors.text,
  placeholderColor: colors.muted,
  selectionColor: colors.accent,
} satisfies TextFieldProps;
