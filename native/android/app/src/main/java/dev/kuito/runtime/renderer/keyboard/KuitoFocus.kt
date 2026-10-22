package dev.kuito.runtime.renderer.keyboard

import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import dev.kuito.runtime.renderer.layout.KuitoRootLayout
import dev.kuito.runtime.renderer.views.KuitoSheetLayout

/**
 * Focus and the keyboard. Focus order is the order inputs appear in Kuito's
 * tree, within the same screen or sheet, skipping hidden and disabled ones.
 */
internal object KuitoFocus {
    fun focus(view: View) {
        view.requestFocus()

        if (!showsKeyboard(view)) return

        // The keyboard can only show for a view in a focused window.
        view.post { input(view).showSoftInput(view, InputMethodManager.SHOW_IMPLICIT) }
    }

    /** `inputMode="none"` shows no keyboard: showSoftInputOnFocus alone does not stop an explicit show. */
    fun showsKeyboard(view: View) = (view as? KuitoEditText)?.traits?.showsKeyboard ?: true

    fun blur(view: View) {
        input(view).hideSoftInputFromWindow(view.windowToken, 0)
        view.clearFocus()
    }

    fun dismiss(any: View) {
        (any.rootView.findFocus() as? EditText)?.let(::blur)
            ?: input(any).hideSoftInputFromWindow(any.windowToken, 0)
    }

    fun next(after: EditText): EditText? {
        val order = fields(container(after))
        val index = order.indexOf(after)

        return order.getOrNull(index + 1).takeIf { index >= 0 }
    }

    /**
     * The return key, after onSubmit: keep the focus, move it to the next
     * input, or hide the keyboard. A single-line field has no line to add:
     * `newline` keeps the focus too.
     */
    fun submitted(field: KuitoEditText) {
        if (field.submitBehavior == "submit" || field.submitBehavior == "newline") return

        val action = field.imeOptions and EditorInfo.IME_MASK_ACTION
        val next = if (action == EditorInfo.IME_ACTION_NEXT) next(field) else null

        if (next != null) next.requestFocus() else blur(field)
    }

    private fun container(view: View): View {
        var current = view

        while (current !is KuitoRootLayout && current !is KuitoSheetLayout) current = current.parent as? View ?: return current

        return current
    }

    private fun fields(view: View): List<EditText> {
        if (view.visibility != View.VISIBLE) return emptyList()

        if (view is EditText) return if (view.isEnabled) listOf(view) else emptyList()

        val group = view as? ViewGroup ?: return emptyList()

        return (0 until group.childCount).flatMap { fields(group.getChildAt(it)) }
    }

    private fun input(view: View) = view.context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
}
