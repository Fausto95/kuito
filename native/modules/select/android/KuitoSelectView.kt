package dev.kuito.runtime.modules.select

import android.content.Context
import android.widget.PopupMenu
import android.widget.Spinner
import com.google.android.material.R as MaterialR
import com.google.android.material.button.MaterialButton
import dev.kuito.runtime.R
import dev.kuito.runtime.modules.KuitoErrorCode
import dev.kuito.runtime.modules.KuitoModuleError
import dev.kuito.runtime.modules.KuitoNativeView
import dev.kuito.runtime.modules.KuitoType
import dev.kuito.runtime.modules.KuitoViewDefinition
import dev.kuito.runtime.modules.KuitoViewEvents
import dev.kuito.runtime.renderer.views.materialThemed

/**
 * `Select` in native/modules/select/select.ts: Material's menu button, which
 * shows the chosen option and opens a popup menu of the options on a tap, the
 * chosen one checked, as iOS's menu button does. Its props are defined here,
 * beside the view, as on iOS.
 */
class KuitoSelectView(context: Context, private val events: KuitoViewEvents) :
    MaterialButton(context.materialThemed(), null, MaterialR.attr.materialButtonOutlinedStyle), KuitoNativeView {

    class Option(val value: String, val label: String)

    private var options = emptyList<Option>()
        set(next) { field = next; show() }
    private var chosen: String? = null
        set(next) { field = next; show() }
    private var placeholder = ""
        set(next) { field = next; show() }
    private val chosenColors = textColors

    /** The menu on screen, closed with the view: its pick would reach a view that is gone. */
    private var menu: PopupMenu? = null

    init {
        isAllCaps = false
        setIconResource(R.drawable.kuito_select_arrow)
        iconGravity = ICON_GRAVITY_END
        setOnClickListener { open() }
        show()
    }

    /** What a menu item calls with its option's value: shown and sent. */
    fun pick(value: String) {
        chosen = value
        events.emit("change", mapOf("value" to value))
    }

    /** TalkBack announces a drop-down list, as for a Spinner. */
    override fun getAccessibilityClassName(): CharSequence = Spinner::class.java.name

    override fun unmount() {
        menu?.dismiss()
    }

    private fun show() {
        val selected = options.firstOrNull { it.value == chosen }

        text = selected?.label ?: placeholder
        setTextColor(if (selected == null) hintTextColors else chosenColors)
    }

    private fun open() {
        val popup = PopupMenu(context, this)

        // Each item keeps its own option: the options may change while the menu is open.
        options.forEachIndexed { index, option ->
            popup.menu.add(0, index, index, option.label).apply {
                isChecked = option.value == chosen
                setOnMenuItemClickListener { pick(option.value); true }
            }
        }
        popup.menu.setGroupCheckable(0, true, true)
        popup.setOnDismissListener { if (menu === popup) menu = null }
        menu = popup
        popup.show()
    }

    companion object {
        /** Options whose values differ: a value names one option. */
        private val list = KuitoType { value ->
            val options = KuitoType.list(KuitoType.obj).decode(value).map { option ->
                Option(KuitoType.string.decode(option.opt("value") ?: missing("value")), KuitoType.string.decode(option.opt("label") ?: missing("label")))
            }

            if (options.distinctBy { it.value }.size != options.size) throw KuitoModuleError(KuitoErrorCode.ARGUMENT, "two options have the same value")
            options
        }

        private fun missing(field: String): Nothing = throw KuitoModuleError(KuitoErrorCode.ARGUMENT, "an option has no $field")

        fun define(view: KuitoViewDefinition<KuitoSelectView>) {
            val text = KuitoType.optional(KuitoType.string)

            view.prop("options", KuitoType.optional(list)) { select, value -> select.options = value ?: emptyList() }
            view.prop("value", text) { select, value -> select.chosen = value }
            view.prop("placeholder", text) { select, value -> select.placeholder = value ?: "" }
            view.prop("disabled", KuitoType.optional(KuitoType.boolean)) { select, value -> select.isEnabled = value != true }
        }
    }
}
