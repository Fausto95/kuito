package dev.kuito.runtime.renderer.properties

import android.content.Context
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import dev.kuito.runtime.renderer.KuitoValue
import dev.kuito.runtime.renderer.keyboard.KuitoEditText
import dev.kuito.runtime.renderer.keyboard.KuitoKeyboardAvoider
import dev.kuito.runtime.renderer.keyboard.KuitoScrollKeyboard
import dev.kuito.runtime.renderer.views.KuitoScrollable

/**
 * The keyboard: return key and submit behavior, autofocus, dismissal and
 * tap handling in scroll views, and avoidance.
 */
internal object KuitoKeyboardProperties {
    private val RETURN_KEYS = mapOf(
        "enter" to EditorInfo.IME_ACTION_UNSPECIFIED, "done" to EditorInfo.IME_ACTION_DONE,
        "go" to EditorInfo.IME_ACTION_GO, "next" to EditorInfo.IME_ACTION_NEXT,
        "search" to EditorInfo.IME_ACTION_SEARCH, "send" to EditorInfo.IME_ACTION_SEND,
    )
    private val SUBMIT_BEHAVIORS = setOf("submit", "blurAndSubmit", "newline")
    private val DISMISS_MODES = setOf("none", "on-drag", "interactive")
    private val TAP_MODES = setOf("never", "always", "handled")

    val setters: Map<String, KuitoPropertySetter> = mapOf(
        "enterKeyHint" to field { context, field, value ->
            val action = RETURN_KEYS[context.keyword(value)] ?: context.unsupportedValue(value, "expects one of its values")

            field.imeOptions = (field.imeOptions and EditorInfo.IME_MASK_ACTION.inv()) or action
            (field.context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).restartInput(field)
        },
        "submitBehavior" to field { context, field, value ->
            val behavior = if (value == KuitoValue.Null) null else context.keyword(value)

            if (behavior != null && behavior !in SUBMIT_BEHAVIORS) context.unsupportedValue(value, "expects one of its values")

            field.submitBehavior = behavior
            // A multi-line field's enter key changes between a new line and an action.
            if (field.multiline) (field.context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).restartInput(field)
        },
        "autoFocus" to field { context, field, value -> field.autoFocus = context.flag(value) },
        // `interactive` dismisses on drag: Android has no keyboard that follows the finger.
        "keyboardDismissMode" to scrollable { context, keyboard, value ->
            val mode = context.keyword(value)

            if (mode !in DISMISS_MODES) context.unsupportedValue(value, "expects one of its values")

            keyboard.dismissMode = mode
        },
        "keyboardShouldPersistTaps" to scrollable { context, keyboard, value ->
            val mode = context.keyword(value)

            if (mode !in TAP_MODES) context.unsupportedValue(value, "expects one of its values")

            keyboard.persistTaps = mode
        },
        "automaticallyAdjustKeyboardInsets" to scrollable { context, keyboard, value ->
            keyboard.adjustsInsets = context.flag(value)
            context.keyboard.avoid()
        },
        "keyboardAvoidance" to { context, value ->
            val mode = context.keyword(value)

            if (mode != "none" && mode !in KuitoKeyboardAvoider.MODES) context.unsupportedValue(value, "expects one of its values")

            context.style.keyboardAvoider?.let { avoider ->
                avoider.reset()
                context.keyboard.avoiders.remove(avoider)
            }
            context.style.keyboardAvoider = if (mode == "none") null else KuitoKeyboardAvoider(mode, context.view, context.style)
            context.style.keyboardAvoider?.let(context.keyboard.avoiders::add)
            context.keyboard.avoid()
        },
    )

    private fun field(apply: (KuitoPropertyContext, KuitoEditText, KuitoValue) -> Unit): KuitoPropertySetter = { context, value ->
        apply(context, context.view as? KuitoEditText ?: context.unsupportedProp(), value)
    }

    /** A ScrollView or a List. */
    private fun scrollable(apply: (KuitoPropertyContext, KuitoScrollKeyboard, KuitoValue) -> Unit): KuitoPropertySetter = { context, value ->
        apply(context, (context.view as? KuitoScrollable ?: context.unsupportedProp()).keyboard, value)
    }
}
