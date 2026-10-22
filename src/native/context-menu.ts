import ContextMenuModule from '../../native/modules/context-menu/context-menu';
import type { KuitoNode } from '../ui/jsx';
import type { NativeViewEvent } from './views';

/** An item of the menu: the value the app keeps, and the label the user reads. */
export type ContextMenuItem = {
  value: string;
  label: string;
  /** Drawn as an action that deletes or discards, in red. */
  destructive?: boolean;
  /** Shown dimmed; the user can't pick it. */
  disabled?: boolean;
};

/** The item the user selected, by its value. */
export type ContextMenuEvent = NativeViewEvent<'select', { value: string }>;

/** Props of `ContextMenu`: the menu's items and title, and the views it opens on. */
export type ContextMenuProps = {
  /** In the order the menu lists them; each value names one item. */
  items: ContextMenuItem[];
  /** Heads the menu. */
  title?: string;
  /** Opens no menu. */
  disabled?: boolean;
  onSelect?: (event: ContextMenuEvent) => void;
  /** The views a long press opens the menu on, laid out inside it as a Box's. */
  children?: KuitoNode;
};

/**
 * The menu a long press opens on the views it wraps, contributed by the
 * ContextMenu module through the native views API: UIContextMenuInteraction
 * on iOS, which lifts the views above the menu, and Android's floating
 * context menu. It is as large as its children, like a Box.
 */
export const ContextMenu = ContextMenuModule.view;
