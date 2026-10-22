// ARIA's role names, mapped onto the platform roles the renderers know
// (VoiceOver traits and TalkBack classes), so an app writes one vocabulary
// (see docs/accessibility.md).
import { own } from './values';

export interface AccessibilityAlias {
  /** The native props this prop sets. */
  names: readonly string[];
  /** The value of native prop `name` for this prop's value. */
  pick(value: unknown, name: string): unknown;
}

/** ARIA roles and the platform role each one means. */
const ROLES: Readonly<Record<string, string>> = Object.freeze({
  alert: 'alert',
  button: 'button',
  checkbox: 'checkbox',
  combobox: 'combobox',
  grid: 'grid',
  heading: 'header',
  img: 'image',
  link: 'link',
  list: 'list',
  menu: 'menu',
  menubar: 'menubar',
  menuitem: 'menuitem',
  none: 'none',
  presentation: 'none',
  progressbar: 'progressbar',
  radio: 'radio',
  radiogroup: 'radiogroup',
  scrollbar: 'scrollbar',
  searchbox: 'search',
  slider: 'adjustable',
  spinbutton: 'spinbutton',
  summary: 'summary',
  switch: 'switch',
  tab: 'tab',
  tablist: 'tablist',
  timer: 'timer',
  toolbar: 'toolbar',
});

function role(value: unknown): unknown {
  if (value == null) return null;

  if (typeof value !== 'string' || !own(ROLES, value))
    throw new TypeError(
      'Unsupported role ' +
        JSON.stringify(value) +
        '. Use one of: ' +
        Object.keys(ROLES).join(', '),
    );

  return ROLES[value];
}

export const ACCESSIBILITY_ALIASES: Readonly<Record<string, AccessibilityAlias>> = Object.freeze({
  role: { names: ['role'], pick: role },
});
