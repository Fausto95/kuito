import SystemUIModule from '../../native/modules/system-ui/system-ui';

/** The status bar, navigation bar and root view, for SystemBars. */
export const systemUI = SystemUIModule;

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** `color` as the platforms parse it: CSS hex, alpha last, or `transparent`. */
export function hexColor(color: string, what: string): string {
  if (color === 'transparent') return '#00000000';

  if (typeof color !== 'string' || !HEX.test(color))
    throw new TypeError(what + ' a hex color like #rrggbb, got ' + JSON.stringify(color));

  return color;
}
