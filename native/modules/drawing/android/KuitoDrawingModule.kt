package dev.kuito.runtime.modules.drawing

import dev.kuito.link.DrawingSpec
import dev.kuito.runtime.link.KuitoModuleView
import dev.kuito.runtime.modules.KuitoModuleContext

/** `Drawing` in native/modules/drawing/drawing.ts: a view and nothing else. */
class KuitoDrawingModule(@Suppress("UNUSED_PARAMETER") context: KuitoModuleContext) : DrawingSpec {
    override fun view(): KuitoModuleView<*> = KuitoModuleView(::KuitoDrawingView, KuitoDrawingView::define)
}
