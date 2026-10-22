// Colors as the style compiler emits them, `#rrggbb` or `#rrggbbaa`, mixed
// channel by channel: a color animates as four numbers, one per channel.

const HEX = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value);
}

/** Red, green, blue and alpha, 0-255. */
export function channels(color: string): number[] {
  const digits = color.length === 7 ? color.slice(1) + 'ff' : color.slice(1);

  return [0, 2, 4, 6].map((at) => parseInt(digits.slice(at, at + 2), 16));
}

/** Channels back to a color; a spring's overshoot clamps to each channel's range. */
export function join(values: number[]): string {
  const clamped = values.map((channel) => Math.min(255, Math.max(0, Math.round(channel))));
  const hex = clamped.map((channel) => channel.toString(16).padStart(2, '0'));

  return '#' + (clamped[3] === 255 ? hex.slice(0, 3) : hex).join('');
}
