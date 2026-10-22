package dev.kuito.runtime.renderer.views

import android.view.View
import dev.kuito.runtime.renderer.KuitoBackMotionPayload
import dev.kuito.runtime.renderer.KuitoEventPayload
import dev.kuito.runtime.renderer.KuitoSheetMotionPayload

/** A view that sends its motion source's `motion` events while the app asks (docs/motion.md#motion-sources). */
internal interface KuitoMotionSource {
    var sendsMotion: Boolean
}

/**
 * A sheet's motion source: how tall it stands on screen and where that is
 * between its lowest snap point (0) and its highest (1), sent on each move
 * of BottomSheetBehavior's slide while the app asks.
 */
internal class KuitoSheetMotion(private val view: View, private val emit: (String, KuitoEventPayload?) -> Unit) {
    var on = false
        set(value) {
            field = value
            sent = null
        }

    private var sent: Pair<Int, Double>? = null

    /** The sheet stands `height` px over the screen's bottom; its snap points span `lowest` to `highest` px. */
    fun moved(height: Int, lowest: Int, highest: Int) {
        if (!on) return

        val progress = if (highest > lowest) (height - lowest).toDouble() / (highest - lowest) else 1.0

        if (sent == height to progress) return

        sent = height to progress
        emit("motion", KuitoSheetMotionPayload(height = (height / view.resources.displayMetrics.density).toDouble(), progress = progress))
    }
}

/**
 * A stack's motion source: how far a back swipe (Android's predictive back)
 * has taken its top screen away, 0 to 1, sent on each change while the app
 * asks; 0 again once the gesture is cancelled or the pop is done.
 */
internal class KuitoBackMotion(private val emit: (String, KuitoEventPayload?) -> Unit) {
    var on = false
        set(value) {
            field = value
            sent = null
        }

    private var sent: Float? = null

    fun moved(progress: Float) {
        if (!on || progress == sent) return

        sent = progress
        emit("motion", KuitoBackMotionPayload(progress = progress.toDouble()))
    }
}
