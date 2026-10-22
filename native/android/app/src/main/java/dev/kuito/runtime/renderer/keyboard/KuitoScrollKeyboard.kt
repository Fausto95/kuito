package dev.kuito.runtime.renderer.keyboard

import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.widget.EditText
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import dev.kuito.runtime.renderer.views.KuitoScrollable
import dev.kuito.runtime.renderer.views.KuitoScrolling
import kotlin.math.hypot

/**
 * A scroll view's or list's keyboard behavior: content insets while the
 * keyboard covers it (automaticallyAdjustKeyboardInsets), dismissal on drag
 * (keyboardDismissMode), and what a tap outside the focused input does while
 * the keyboard shows (keyboardShouldPersistTaps), as on iOS.
 */
internal class KuitoScrollKeyboard {
    var adjustsInsets = true
    var dismissMode = "none"
    var persistTaps = "never"

    private var downX = 0f
    private var downY = 0f
    private var tap = false
    private var dragged = false

    /**
     * `never`: while the keyboard shows, the scroll view takes a touch outside
     * the focused input from the start, so it scrolls but a tap reaches nothing.
     */
    fun intercepts(scroll: View, event: MotionEvent) =
        event.actionMasked == MotionEvent.ACTION_DOWN && persistTaps == "never" && outsideFocus(scroll, event)

    /** Sees every touch through the scroll view: drags and taps that dismiss. */
    fun observe(scroll: View, event: MotionEvent) {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = event.rawX
                downY = event.rawY
                dragged = false
                tap = persistTaps != "always" && outsideFocus(scroll, event)
            }
            MotionEvent.ACTION_MOVE -> {
                if (dragged || hypot(event.rawX - downX, event.rawY - downY) < ViewConfiguration.get(scroll.context).scaledTouchSlop) return

                dragged = true
                tap = false

                if (dismissMode != "none" && shown(scroll)) KuitoFocus.dismiss(scroll)
            }
            MotionEvent.ACTION_UP -> {
                if (!tap || dragged) return

                if (persistTaps == "never" || !handled(scroll, event.rawX, event.rawY)) KuitoFocus.dismiss(scroll)
            }
        }
    }

    /** Insets the scrolling view by the part the keyboard covers and keeps a focused input inside above it. */
    fun avoid(scrollable: KuitoScrollable, keyboardTop: Int, focused: EditText?, reveal: Boolean) {
        val scroller = scrollable.scroller
        val overlap = if (adjustsInsets && scrollable.vertical) (scroller.bottomInWindow() - keyboardTop).coerceAtLeast(0) else 0

        scrollable.insetKeyboard(overlap)

        if (!reveal || overlap == 0 || focused == null || !focused.isDescendantOf(scroller)) return

        val clearance = (KuitoKeyboard.CLEARANCE * scroller.resources.displayMetrics.density).toInt()
        val hidden = focused.bottomInWindow() + clearance - keyboardTop

        if (hidden > 0) scrollable.lift(hidden)
    }

    private fun shown(view: View) = ViewCompat.getRootWindowInsets(view)?.isVisible(WindowInsetsCompat.Type.ime()) == true

    private fun outsideFocus(scroll: View, event: MotionEvent): Boolean {
        val focused = scroll.rootView.findFocus() as? EditText ?: return false

        return shown(scroll) && !contains(focused, event.rawX, event.rawY)
    }

    /** Whether something that handles taps (a pressable, button, switch or input) is under the point. */
    private fun handled(view: View, x: Float, y: Float): Boolean {
        if (!view.isShown || !contains(view, x, y)) return false

        val group = view as? ViewGroup

        if (group != null && (group.childCount - 1 downTo 0).any { handled(group.getChildAt(it), x, y) }) return true

        return view.isClickable && view !is KuitoScrolling
    }

    private fun contains(view: View, x: Float, y: Float): Boolean {
        val location = IntArray(2).also(view::getLocationOnScreen)

        return x >= location[0] && x < location[0] + view.width && y >= location[1] && y < location[1] + view.height
    }
}
