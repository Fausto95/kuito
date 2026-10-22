package dev.kuito.runtime.modules.contextmenu

import dev.kuito.link.ContextMenuSpec
import dev.kuito.runtime.link.KuitoModuleView
import dev.kuito.runtime.modules.KuitoModuleContext

/** `ContextMenu` in native/modules/context-menu/context-menu.ts: a view and nothing else. */
class KuitoContextMenuModule(@Suppress("UNUSED_PARAMETER") context: KuitoModuleContext) : ContextMenuSpec {
    override fun view(): KuitoModuleView<*> =
        KuitoModuleView(::KuitoContextMenuView, KuitoContextMenuView::define)
}
