package dev.kuito.runtime.modules.segmentedcontrol

import android.content.Context
import android.view.View
import com.google.android.material.R as MaterialR
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup
import dev.kuito.runtime.modules.KuitoErrorCode
import dev.kuito.runtime.modules.KuitoModuleError
import dev.kuito.runtime.modules.KuitoType
import dev.kuito.runtime.modules.KuitoViewDefinition
import dev.kuito.runtime.modules.KuitoViewEvents
import dev.kuito.runtime.renderer.views.materialThemed

/**
 * `SegmentedControl` in native/modules/segmented-control/segmented-control.ts:
 * Material's segmented button, a single-selection toggle group with an
 * outlined button per option, the chosen one checked. Its props are defined
 * here, beside the view, as on iOS.
 */
class KuitoSegmentedControlView(context: Context, private val events: KuitoViewEvents) :
    MaterialButtonToggleGroup(context.materialThemed()) {

    class Option(val value: String, val label: String)

    private var options = emptyList<Option>()
        set(next) { field = next; rebuild() }
    private var chosen: String? = null
        set(next) { field = next; follow() }
    /** While the app's props check a button: the group's listener hears those too. */
    private var applying = false

    init {
        isSingleSelection = true
        addOnButtonCheckedListener { _, id, isChecked ->
            val option = options.getOrNull(indexOfChild(findViewById(id)))

            if (isChecked && !applying && option != null) {
                chosen = option.value
                events.emit("change", mapOf("value" to option.value))
            }
        }
    }

    private fun rebuild() = quietly {
        removeAllViews()
        options.forEach { option ->
            addView(
                MaterialButton(context, null, MaterialR.attr.materialButtonOutlinedStyle).apply {
                    id = View.generateViewId()
                    text = option.label
                    isAllCaps = false
                    // A MaterialButton's own insets and minimum height leave a 32-point control no room for its text.
                    insetTop = 0
                    insetBottom = 0
                    minHeight = 0
                    minimumHeight = 0
                    // The group passes `enabled` to the buttons it has, not to later ones.
                    isEnabled = this@KuitoSegmentedControlView.isEnabled
                },
                LayoutParams(0, LayoutParams.MATCH_PARENT, 1f),
            )
        }
        select()
    }

    private fun follow() = quietly { select() }

    /** Checks the chosen option's button, or none; a button may be unchecked only while selection isn't required. */
    private fun select() {
        val index = options.indexOfFirst { it.value == chosen }

        isSelectionRequired = false
        if (index < 0) clearChecked() else check(getChildAt(index).id)
        isSelectionRequired = index >= 0
    }

    private inline fun quietly(apply: () -> Unit) {
        applying = true
        try {
            apply()
        } finally {
            applying = false
        }
    }

    companion object {
        /** Options whose values differ: a value names one button. */
        private val list = KuitoType { value ->
            val options = KuitoType.list(KuitoType.obj).decode(value).map { option ->
                Option(KuitoType.string.decode(option.opt("value") ?: missing("value")), KuitoType.string.decode(option.opt("label") ?: missing("label")))
            }

            if (options.distinctBy { it.value }.size != options.size) throw KuitoModuleError(KuitoErrorCode.ARGUMENT, "two options have the same value")
            options
        }

        private fun missing(field: String): Nothing = throw KuitoModuleError(KuitoErrorCode.ARGUMENT, "an option has no $field")

        fun define(view: KuitoViewDefinition<KuitoSegmentedControlView>) {
            view.prop("options", KuitoType.optional(list)) { control, value -> control.options = value ?: emptyList() }
            view.prop("value", KuitoType.optional(KuitoType.string)) { control, value -> control.chosen = value }
            view.prop("disabled", KuitoType.optional(KuitoType.boolean)) { control, value -> control.isEnabled = value != true }
        }
    }
}
