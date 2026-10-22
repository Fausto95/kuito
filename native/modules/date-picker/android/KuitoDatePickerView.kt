package dev.kuito.runtime.modules.datepicker

import android.app.DatePickerDialog
import android.app.Dialog
import android.app.TimePickerDialog
import android.content.Context
import android.text.format.DateFormat
import android.text.format.DateUtils
import com.google.android.material.R as MaterialR
import com.google.android.material.button.MaterialButton
import dev.kuito.runtime.modules.KuitoErrorCode
import dev.kuito.runtime.modules.KuitoModuleError
import dev.kuito.runtime.modules.KuitoNativeView
import dev.kuito.runtime.modules.KuitoType
import dev.kuito.runtime.modules.KuitoViewDefinition
import dev.kuito.runtime.modules.KuitoViewEvents
import dev.kuito.runtime.renderer.views.materialThemed
import java.util.Calendar
import kotlin.math.roundToLong

/**
 * `DatePicker` in native/modules/date-picker/date-picker.ts. Android has no
 * inline counterpart of iOS's compact picker, so it is what Material forms
 * use: a button that shows the moment and opens the platform's date dialog,
 * then its time dialog for `datetime`. Its props are defined here, beside the
 * view, as on iOS.
 */
class KuitoDatePickerView(context: Context, private val events: KuitoViewEvents) :
    MaterialButton(context.materialThemed(), null, MaterialR.attr.materialButtonOutlinedStyle), KuitoNativeView {

    enum class Kind(val shown: Int) {
        DATE(DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_SHOW_YEAR),
        TIME(DateUtils.FORMAT_SHOW_TIME),
        DATETIME(DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_SHOW_YEAR or DateUtils.FORMAT_SHOW_TIME),
    }

    private var moment = System.currentTimeMillis()
        set(next) { field = next; show() }
    private var kind = Kind.DATE
        set(next) { field = next; show() }
    private var min: Long? = null
    private var max: Long? = null
    /** The dialog on screen, closed with the view: its pick would reach a view that is gone. */
    private var dialog: Dialog? = null

    init {
        isAllCaps = false
        setOnClickListener { open() }
        show()
    }

    /** What the dialogs call with the moment the user picked: kept within the bounds, shown and sent. */
    fun pick(picked: Long) {
        // In that order, as on iOS: a max before the min wins rather than throwing on a pick.
        moment = picked.coerceAtLeast(min ?: Long.MIN_VALUE).coerceAtMost(max ?: Long.MAX_VALUE)
        events.emit("change", mapOf("value" to moment))
    }

    private fun show() {
        text = DateUtils.formatDateTime(context, moment, kind.shown or DateUtils.FORMAT_ABBREV_MONTH)
    }

    private fun open() = if (kind == Kind.TIME) openTime(calendar()) else openDate()

    private fun calendar() = Calendar.getInstance().apply { timeInMillis = moment }

    private fun openDate() {
        val day = calendar()
        val dialog = DatePickerDialog(context, { _, year, month, date ->
            day.set(year, month, date)
            if (kind == Kind.DATETIME) openTime(day) else pick(day.timeInMillis)
        }, day.get(Calendar.YEAR), day.get(Calendar.MONTH), day.get(Calendar.DAY_OF_MONTH))

        min?.let { dialog.datePicker.minDate = it }
        max?.let { dialog.datePicker.maxDate = it }
        present(dialog)
    }

    /** The time dialog over `day`, whose date stays. */
    private fun openTime(day: Calendar) {
        present(TimePickerDialog(context, { _, hour, minute ->
            day.set(Calendar.HOUR_OF_DAY, hour)
            day.set(Calendar.MINUTE, minute)
            pick(day.timeInMillis)
        }, day.get(Calendar.HOUR_OF_DAY), day.get(Calendar.MINUTE), DateFormat.is24HourFormat(context)))
    }

    private fun present(next: Dialog) {
        dialog = next
        next.setOnDismissListener { if (dialog === next) dialog = null }
        next.show()
    }

    override fun unmount() {
        dialog?.dismiss()
    }

    companion object {
        /** Milliseconds since 1970, as JavaScript's `Date` counts them. */
        private val instant = KuitoType { value ->
            val milliseconds = KuitoType.double.decode(value)

            if (!milliseconds.isFinite()) throw KuitoModuleError(KuitoErrorCode.ARGUMENT, "expected milliseconds, got $value")
            milliseconds.roundToLong()
        }

        fun define(view: KuitoViewDefinition<KuitoDatePickerView>) {
            val bound = KuitoType.optional(instant)

            view.prop("value", bound) { picker, value -> picker.moment = value ?: System.currentTimeMillis() }
            view.prop("type", KuitoType.optional(KuitoType.enum(Kind.values()))) { picker, value -> picker.kind = value ?: Kind.DATE }
            view.prop("min", bound) { picker, value -> picker.min = value }
            view.prop("max", bound) { picker, value -> picker.max = value }
            view.prop("disabled", KuitoType.optional(KuitoType.boolean)) { picker, value -> picker.isEnabled = value != true }
        }
    }
}
