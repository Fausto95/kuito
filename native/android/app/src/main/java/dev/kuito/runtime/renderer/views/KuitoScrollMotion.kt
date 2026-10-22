package dev.kuito.runtime.renderer.views

import android.view.View
import android.view.animation.AnimationUtils
import dev.kuito.runtime.renderer.KuitoEventPayload
import dev.kuito.runtime.renderer.KuitoScrollMotionPayload

/**
 * A scrolling view's motion source (docs/motion.md#motion-sources): while the
 * app asks for it, every move sends where the view is in its scroll range,
 * how fast it moves and how far past an end it is pulled. A display frame
 * that finds it still sends it again at rest, velocity 0, so a finger held
 * still or a fling that ends leaves no stale speed behind. Turned on, it
 * first reports on the next frame: the batch that asked brings the UI-thread
 * handler after its views. Android's overscroll stretches the drawing, not
 * the content's position: overscroll stays 0.
 */
internal class KuitoScrollMotion(
    private val view: View,
    /** Where the view is along its axis, in pixels. */
    private val position: () -> Int,
    private val emit: (String, KuitoEventPayload?) -> Unit,
) {
    /** Display time in seconds; tests set their own. */
    var clock: () -> Double = { AnimationUtils.currentAnimationTimeMillis() / 1000.0 }

    var on = false
        set(value) {
            if (value == field) return

            field = value
            velocity = 0.0
            last = offset() to clock()
            reporting = value

            if (value) nextFrame()
        }

    private val density = view.resources.displayMetrics.density
    private var last = 0.0 to 0.0
    private var velocity = 0.0
    /** Turned on and not reported yet. */
    private var reporting = false
    private var ticking = false
    private val tick = Runnable {
        ticking = false
        frame()
    }

    /** The view scrolled: from its scroll listener. */
    fun scrolled() {
        if (!on) return

        val offset = offset()
        val now = clock()
        val elapsed = now - last.second

        // A move from rest has no speed yet: the time since says how long it rested.
        velocity = if (elapsed > 0 && elapsed < REST_AFTER) (offset - last.first) / elapsed else 0.0
        last = offset to now
        reporting = false
        send()
        nextFrame()
    }

    /** A display frame while it moves: one that finds it still for [REST_AFTER] brings it to rest. */
    fun frame() {
        if (!on) return

        if (reporting) {
            reporting = false
            return send()
        }

        val now = clock()

        if (now - last.second < REST_AFTER) return nextFrame()

        last = last.first to now
        velocity = 0.0
        send()
    }

    private fun offset() = (position() / density).toDouble()

    private fun send() = emit("motion", payload())

    private fun payload() = KuitoScrollMotionPayload(offset = last.first, velocity = velocity, overscroll = 0.0)

    private fun nextFrame() {
        if (ticking) return

        ticking = true
        view.postOnAnimation(tick)
    }

    private companion object {
        /**
         * Still for this long, two frames at 60 Hz, it is at rest: a view may
         * scroll on fewer display frames than it is drawn on, as at 120 Hz.
         */
        const val REST_AFTER = 1.0 / 30
    }
}
