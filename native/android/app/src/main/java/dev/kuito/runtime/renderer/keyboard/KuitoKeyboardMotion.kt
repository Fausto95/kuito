package dev.kuito.runtime.renderer.keyboard

import android.view.View
import dev.kuito.runtime.renderer.KuitoEventEmitter
import dev.kuito.runtime.renderer.KuitoKeyboardMotionPayload

/**
 * keyboard.height (docs/keyboard.md#keyboard): once the app asks, each
 * change of the keyboard's inset goes out as `keyboard.move`, in dp: every
 * frame of WindowInsetsAnimation's progress, and a change without one. The
 * first report waits for the next frame: the batch that asked brings the
 * UI-thread handler after it.
 */
internal class KuitoKeyboardMotion(
    private val view: View,
    /** The keyboard's height in px, as it is drawn this frame. */
    private val height: () -> Int,
    private val events: KuitoEventEmitter,
) {
    var on = false
        set(value) {
            if (value == field) return

            field = value
            sent = null

            if (value) view.postOnAnimation(::frame)
        }

    private var sent: Int? = null

    /** The inset moved. */
    fun moved() {
        if (on) frame()
    }

    /** Sends the height when it changed since the last report. */
    fun frame() {
        if (!on) return

        val px = height()

        if (px == sent) return

        sent = px
        events.emit(0, "keyboard.move", KuitoKeyboardMotionPayload(height = (px / view.resources.displayMetrics.density).toDouble()))
    }
}
