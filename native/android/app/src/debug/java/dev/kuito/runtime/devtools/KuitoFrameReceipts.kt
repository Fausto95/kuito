package dev.kuito.runtime.devtools

import android.os.Looper
import android.view.Choreographer
import dev.kuito.runtime.renderer.KuitoFrameLedger

/**
 * Frame receipts in a development build (docs/performance.md#frame-receipts):
 * tells the ledger when the main thread starts and finishes a message and
 * when each display frame comes, and reports a frame that dropped with what
 * ran in it and why.
 */
class KuitoFrameReceipts(private val refreshRate: () -> Float) : Choreographer.FrameCallback {
    /** Each display frame: its vsync in nanoseconds, the display's interval, the work in seconds and the frames dropped. */
    var onFrame: ((Long, Double, Double, Int) -> Unit)? = null

    /**
     * A dropped frame, as one line, and whether it is worth a warning: one
     * that Kuito's work took the time of, a second or more after the last
     * warning. The others are logged only, so a drop the LogBox's own
     * presentation causes cannot feed itself.
     */
    var onDrop: ((String, Boolean) -> Unit)? = null

    /** Names a view in a report by its number. */
    var nameView: (Int) -> String = { "view $it" }

    private var running = false
    private var reported = 0L
    private var warned = Long.MIN_VALUE / 2

    fun start() {
        if (running) return

        running = true
        reported = KuitoFrameLedger.dropSequence()
        KuitoFrameLedger.woke()
        // The main looper prints around every message it runs: the time
        // between the two is the thread's work, frames included. Input it
        // reads between messages (a touch's down and up) goes uncounted.
        Looper.getMainLooper().setMessageLogging { line ->
            if (line.startsWith(">>>>>")) KuitoFrameLedger.woke()
            else if (line.startsWith("<<<<<")) KuitoFrameLedger.slept()
        }
        Choreographer.getInstance().postFrameCallback(this)
    }

    fun stop() {
        running = false
        Looper.getMainLooper().setMessageLogging(null)
        Choreographer.getInstance().removeFrameCallback(this)
    }

    companion object {
        /**
         * A view as a report names it: its kind, the app's id for it when it
         * has one (a generated label says nothing to the reader), and its number.
         */
        fun name(id: Int, kind: String, label: String) = if (label.startsWith("__kuito:")) "$kind ($id)" else "$kind $label ($id)"
    }

    override fun doFrame(frameTimeNanos: Long) {
        if (!running) return

        Choreographer.getInstance().postFrameCallback(this)

        val interval = 1.0 / refreshRate()
        val (work, dropped) = KuitoFrameLedger.frame(frameTimeNanos / 1e9, interval)

        onFrame?.invoke(frameTimeNanos, interval, work, dropped.toInt())

        val sequence = KuitoFrameLedger.dropSequence()

        if (sequence == reported) return

        reported = sequence

        val warn = KuitoFrameLedger.lastDropReceipted() && frameTimeNanos - warned >= 1_000_000_000L

        if (warn) warned = frameTimeNanos
        onDrop?.invoke(KuitoFrameLedger.describeLastDrop(nameView), warn)
    }
}
