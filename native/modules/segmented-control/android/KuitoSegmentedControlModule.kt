package dev.kuito.runtime.modules.segmentedcontrol

import dev.kuito.link.SegmentedControlSpec
import dev.kuito.runtime.link.KuitoModuleView
import dev.kuito.runtime.modules.KuitoModuleContext

/** `SegmentedControl` in native/modules/segmented-control/segmented-control.ts: a view and nothing else. */
class KuitoSegmentedControlModule(@Suppress("UNUSED_PARAMETER") context: KuitoModuleContext) : SegmentedControlSpec {
    override fun view(): KuitoModuleView<*> =
        KuitoModuleView(::KuitoSegmentedControlView, KuitoSegmentedControlView::define)
}
