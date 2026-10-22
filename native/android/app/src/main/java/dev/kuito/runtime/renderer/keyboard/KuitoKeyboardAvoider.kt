package dev.kuito.runtime.renderer.keyboard

import android.graphics.RectF
import android.view.View
import android.widget.EditText
import dev.kuito.runtime.renderer.styling.KuitoViewStyle
import java.lang.ref.WeakReference
import kotlin.math.roundToInt

/**
 * A container's keyboardAvoidance: `padding` pads its bottom by the part of
 * it the keyboard covers; `position` lifts it until its focused input (or,
 * without one, its own bottom) clears the keyboard. Measured against the
 * keyboard's frame, never a guessed offset. Positions are px in the window.
 */
internal class KuitoKeyboardAvoider(val mode: String, view: View, style: KuitoViewStyle) {
    private val view = WeakReference(view)
    private val style = WeakReference(style)

    fun apply(keyboardTop: Int, focused: EditText?) {
        val view = view.get() ?: return
        val style = style.get() ?: return
        val density = view.resources.displayMetrics.density

        when (mode) {
            "padding" -> {
                style.keyboardInset = (view.bottomInWindow() - keyboardTop).coerceAtLeast(0) / density
                style.applyInset(view)
            }
            "position" -> {
                val target = focused?.takeIf { it.isDescendantOf(view) }
                val clearance = if (target == null) 0f else KuitoKeyboard.CLEARANCE * density
                // Where the target sits without this view's lift.
                val resting = (target ?: view).bottomInWindow() + style.keyboardOffset * density

                val offset = (resting + clearance - keyboardTop).coerceAtLeast(0f) / density

                if (offset == style.keyboardOffset) return

                style.keyboardOffset = offset
                view.translationY = (style.translateY - style.keyboardOffset) * density
            }
        }
    }

    /** Undoes this avoider's change, for a prop that turns it off. */
    fun reset() {
        val view = view.get() ?: return
        val style = style.get() ?: return

        style.keyboardInset = 0f
        style.keyboardOffset = 0f
        style.applyInset(view)
        view.translationY = style.translateY * view.resources.displayMetrics.density
    }

    companion object {
        val MODES = setOf("padding", "position")
    }
}

internal fun View.isDescendantOf(ancestor: View): Boolean {
    var current: View? = this

    while (current != null) {
        if (current === ancestor) return true

        current = current.parent as? View
    }

    return false
}

/**
 * Where the view's bottom edge is drawn in its window. getLocationInWindow
 * maps only the view's top-left corner, so adding the height is wrong under
 * a scaled, rotated or flipped ancestor (an inverted list's flip moves that
 * corner to the bottom); this maps the whole rect through the same steps.
 */
internal fun View.bottomInWindow(): Int {
    val rect = RectF(0f, 0f, width.toFloat(), height.toFloat())
    var current = this

    while (true) {
        current.matrix.mapRect(rect)
        rect.offset(current.left.toFloat(), current.top.toFloat())

        val parent = current.parent as? View ?: break

        rect.offset(-parent.scrollX.toFloat(), -parent.scrollY.toFloat())
        current = parent
    }

    return rect.bottom.roundToInt()
}
