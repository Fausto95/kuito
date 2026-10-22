// Formats a TextField's `format` takes (docs/keyboard.md#formatting): examples
// for apps to copy, not built-ins. test/text-edits.test.ts holds the caret to
// them; tests/formats.test.tsx types into fields that use them.

/** Groups of four digits, at most 19: `4242 4242 4242 4242`. */
export function cardNumber(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 19);

  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** A card's expiry, `MM/YY`: the slash comes with the year's first digit. */
export function expiry(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 4);

  return digits.length > 2 ? digits.slice(0, 2) + '/' + digits.slice(2) : digits;
}

/** Dollars with thousands grouped and at most two decimals: `$1,234.5`. */
export function amount(text: string): string {
  const [whole = '', ...decimals] = text.replace(/[^\d.]/g, '').split('.');
  const grouped = whole.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  if (!grouped && !decimals.length) return '';

  return '$' + (decimals.length ? grouped + '.' + decimals.join('').slice(0, 2) : grouped);
}
