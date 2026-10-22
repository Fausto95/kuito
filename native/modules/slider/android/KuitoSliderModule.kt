package dev.kuito.runtime.modules.slider

import dev.kuito.link.SliderSpec
import dev.kuito.runtime.link.KuitoModuleView
import dev.kuito.runtime.modules.KuitoModuleContext

/** `Slider` in native/modules/slider/slider.ts: a view and nothing else. */
class KuitoSliderModule(@Suppress("UNUSED_PARAMETER") context: KuitoModuleContext) : SliderSpec {
    override fun view(): KuitoModuleView<*> = KuitoModuleView(::KuitoSliderView, KuitoSliderView::define)
}
