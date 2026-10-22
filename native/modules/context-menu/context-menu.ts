import { defineModule, view } from '../../../src/native/define-module';
import type { ContextMenuProps } from '../../../src/native/context-menu';

// The menu a long press opens on the views it wraps: UIContextMenuInteraction
// on iOS, Android's floating context menu.
export default defineModule('ContextMenu', {
  view: view<ContextMenuProps>({ events: ['select'], children: true }),
  ios: { class: 'KuitoContextMenuModule' },
  android: { class: 'dev.kuito.runtime.modules.contextmenu.KuitoContextMenuModule' },
});
