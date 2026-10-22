package dev.kuito.runtime.modules.datepicker

import dev.kuito.link.DatePickerSpec
import dev.kuito.runtime.link.KuitoModuleView
import dev.kuito.runtime.modules.KuitoModuleContext

/** `DatePicker` in native/modules/date-picker/date-picker.ts: a view and nothing else. */
class KuitoDatePickerModule(@Suppress("UNUSED_PARAMETER") context: KuitoModuleContext) : DatePickerSpec {
    override fun view(): KuitoModuleView<*> = KuitoModuleView(::KuitoDatePickerView, KuitoDatePickerView::define)
}
