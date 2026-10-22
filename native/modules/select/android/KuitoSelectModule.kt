package dev.kuito.runtime.modules.select

import dev.kuito.link.SelectSpec
import dev.kuito.runtime.link.KuitoModuleView
import dev.kuito.runtime.modules.KuitoModuleContext

/** `Select` in native/modules/select/select.ts: a view and nothing else. */
class KuitoSelectModule(@Suppress("UNUSED_PARAMETER") context: KuitoModuleContext) : SelectSpec {
    override fun view(): KuitoModuleView<*> = KuitoModuleView(::KuitoSelectView, KuitoSelectView::define)
}
