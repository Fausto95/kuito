package dev.kuito.runtime.renderer.accessibility

import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.RadioButton
import android.widget.SeekBar
import android.widget.Switch
import android.widget.TextView
import android.widget.ToggleButton
import androidx.core.view.AccessibilityDelegateCompat
import androidx.core.view.ViewCompat
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat.AccessibilityActionCompat
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat.RangeInfoCompat
import dev.kuito.runtime.renderer.KuitoAccessibilityActionPayload

/**
 * A view's accessibility props, composed into what TalkBack reads: its node's
 * role, state, range and actions, and whether the view is an element at all.
 * Several props feed each of these, so every change recomposes them all.
 */
internal class KuitoAccessibility {
    var accessible: Boolean? = null
    var label: String? = null
    var hint: String? = null
    var role: String? = null
    var elementsHidden = false
    var liveRegion = "off"
    /** `aria-*` state and value facts, by prop name. */
    val facts = mutableMapOf<String, Any?>()
    var actions: List<Pair<String, String?>> = emptyList()

    private var installed = false
    private var customActions: List<Int> = emptyList()

    fun apply(view: View, emit: (String, KuitoAccessibilityActionPayload) -> Unit) {
        if (!installed) {
            ViewCompat.setAccessibilityDelegate(view, delegate)
            installed = true
        }

        view.contentDescription = label
        view.importantForAccessibility =
            if (elementsHidden) View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS else View.IMPORTANT_FOR_ACCESSIBILITY_AUTO
        accessible?.let { ViewCompat.setScreenReaderFocusable(view, it) }
        view.accessibilityLiveRegion = LIVE_REGIONS.getValue(liveRegion)
        applyActions(view, emit)
    }

    private val delegate = object : AccessibilityDelegateCompat() {
        override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfoCompat) {
            super.onInitializeAccessibilityNodeInfo(host, info)

            role?.let { role ->
                ROLE_CLASSES[role]?.let { info.className = it.name }
                ROLE_DESCRIPTIONS[role]?.let { info.roleDescription = it }
                info.isHeading = role == "header"
            }

            hint?.let { info.hintText = it }

            if (fact("aria-disabled") == "true") info.isEnabled = false

            if (fact("aria-selected") == "true") info.isSelected = true

            fact("aria-checked")?.let { checked ->
                info.isCheckable = true
                info.isChecked = checked == "true"
            }

            fact("aria-expanded")?.let { expanded ->
                info.addAction(if (expanded == "true") AccessibilityActionCompat.ACTION_COLLAPSE else AccessibilityActionCompat.ACTION_EXPAND)
            }

            val now = number("aria-valuenow")

            if (now != null) info.rangeInfo = RangeInfoCompat.obtain(
                RangeInfoCompat.RANGE_TYPE_FLOAT, number("aria-valuemin") ?: 0f, number("aria-valuemax") ?: 100f, now,
            )

            val words = listOfNotNull(
                fact("aria-valuetext"),
                if (fact("aria-checked") == "mixed") "mixed" else null,
                if (fact("aria-busy") == "true") "busy" else null,
            )

            if (words.isNotEmpty()) info.stateDescription = words.joinToString(", ")
        }
    }

    /**
     * activate, longpress, increment and decrement replace TalkBack's own
     * click, long click and scroll actions; the rest are custom actions.
     * magicTap and escape have no TalkBack gesture and are iOS only.
     */
    private fun applyActions(view: View, emit: (String, KuitoAccessibilityActionPayload) -> Unit) {
        customActions.forEach { ViewCompat.removeAccessibilityAction(view, it) }
        STANDARD.values.forEach { ViewCompat.replaceAccessibilityAction(view, it, null, null) }

        customActions = actions.mapNotNull { (name, label) ->
            val perform = { _: View, _: Any? -> emit("accessibilityaction", KuitoAccessibilityActionPayload(name)); true }
            val standard = STANDARD[name]

            when {
                standard != null -> null.also { ViewCompat.replaceAccessibilityAction(view, standard, label, perform) }
                name in IOS_ONLY -> null
                else -> ViewCompat.addAccessibilityAction(view, label ?: name, perform)
            }
        }
    }

    private fun fact(name: String) = facts[name]?.toString()

    private fun number(name: String) = facts[name]?.toString()?.toFloatOrNull()

    companion object {
        /** React Native's roles as the widget class TalkBack announces. */
        val ROLE_CLASSES: Map<String, Class<out View>?> = mapOf(
            "none" to null, "adjustable" to SeekBar::class.java, "alert" to null, "button" to Button::class.java,
            "checkbox" to CheckBox::class.java, "combobox" to null, "grid" to null, "header" to null,
            "image" to ImageView::class.java, "imagebutton" to ImageButton::class.java, "keyboardkey" to Button::class.java,
            "link" to null, "list" to null, "menu" to null, "menubar" to null, "menuitem" to null,
            "progressbar" to ProgressBar::class.java, "radio" to RadioButton::class.java, "radiogroup" to null,
            "scrollbar" to null, "search" to EditText::class.java, "spinbutton" to null, "summary" to null,
            "switch" to Switch::class.java, "tab" to null, "tablist" to null, "text" to TextView::class.java,
            "timer" to null, "togglebutton" to ToggleButton::class.java, "toolbar" to null,
        )

        /** Roles no widget class names, read as a role description instead. */
        private val ROLE_DESCRIPTIONS = mapOf(
            "alert" to "alert", "combobox" to "combo box", "grid" to "grid", "link" to "link", "list" to "list",
            "menu" to "menu", "menubar" to "menu bar", "menuitem" to "menu item", "radiogroup" to "radio group",
            "scrollbar" to "scroll bar", "spinbutton" to "spin button", "summary" to "summary", "tab" to "tab",
            "tablist" to "tab list", "timer" to "timer", "toolbar" to "toolbar",
        )

        val LIVE_REGIONS = mapOf(
            "off" to View.ACCESSIBILITY_LIVE_REGION_NONE,
            "polite" to View.ACCESSIBILITY_LIVE_REGION_POLITE,
            "assertive" to View.ACCESSIBILITY_LIVE_REGION_ASSERTIVE,
        )

        private val STANDARD = mapOf(
            "activate" to AccessibilityActionCompat.ACTION_CLICK,
            "longpress" to AccessibilityActionCompat.ACTION_LONG_CLICK,
            "increment" to AccessibilityActionCompat.ACTION_SCROLL_FORWARD,
            "decrement" to AccessibilityActionCompat.ACTION_SCROLL_BACKWARD,
        )

        private val IOS_ONLY = setOf("magicTap", "escape")
    }
}
