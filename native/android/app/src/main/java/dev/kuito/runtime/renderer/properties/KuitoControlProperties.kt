package dev.kuito.runtime.renderer.properties

import android.content.res.ColorStateList
import android.os.Build
import android.view.View
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.Switch
import dev.kuito.runtime.renderer.KuitoValue
import dev.kuito.runtime.renderer.views.KuitoPressableLayout

/** Control state: disabling, placeholders, toggles and indicators. */
internal object KuitoControlProperties {
    val setters: Map<String, KuitoPropertySetter> = mapOf(
        "disabled" to { context, value ->
            val disabled = context.flag(value)
            val pressable = context.view as? KuitoPressableLayout

            if (pressable != null) pressable.disabled = disabled else context.view.isEnabled = !disabled
        },
        "placeholder" to remeasured { context, value ->
            val field = context.view as? EditText ?: context.unsupportedProp()

            field.hint = if (value == KuitoValue.Null) null else context.text(value)
        },
        "placeholderTextColor" to { context, value ->
            val field = context.view as? EditText ?: context.unsupportedProp()

            val initial = context.style.initialHintTextColors ?: field.hintTextColors.also { context.style.initialHintTextColors = it }

            if (value == KuitoValue.Null) field.setHintTextColor(initial) else field.setHintTextColor(context.color(value))
        },
        "selectionColor" to { context, value ->
            val field = context.view as? EditText ?: context.unsupportedProp()
            val initial = context.style.initialHighlightColor ?: field.highlightColor.also { context.style.initialHighlightColor = it }
            val color = if (value == KuitoValue.Null) null else context.color(value)
            val tint = color?.let(ColorStateList::valueOf)

            field.highlightColor = color?.let { (it and 0x00ffffff) or 0x59000000 } ?: initial
            if (Build.VERSION.SDK_INT >= 29) {
                field.textCursorDrawable?.setTintList(tint)
                field.textSelectHandle?.setTintList(tint)
            }
        },
        "checked" to { context, value ->
            val toggle = context.view as? Switch ?: context.unsupportedProp()

            // A reactive property commit is not a user-generated change, but
            // Android fires OnCheckedChangeListener for programmatic changes.
            toggle.setOnCheckedChangeListener(null)
            toggle.isChecked = context.flag(value)
            toggle.setOnCheckedChangeListener(context.events.switchChanged(context.id))
        },
        "animating" to { context, value ->
            val indicator = context.view as? ProgressBar ?: context.unsupportedProp()

            indicator.visibility = if (context.flag(value)) View.VISIBLE else View.GONE
        },
    )
}
