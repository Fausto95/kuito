package dev.kuito.runtime.modules.blur

import dev.kuito.link.BlurSpec
import dev.kuito.runtime.link.KuitoModuleView
import dev.kuito.runtime.modules.KuitoModuleContext

/** `Blur` in native/modules/blur/blur.ts: a view and nothing else. */
class KuitoBlurModule(@Suppress("UNUSED_PARAMETER") context: KuitoModuleContext) : BlurSpec {
    override fun view(): KuitoModuleView<*> = KuitoModuleView(::KuitoBlurView, KuitoBlurView::define)
}
