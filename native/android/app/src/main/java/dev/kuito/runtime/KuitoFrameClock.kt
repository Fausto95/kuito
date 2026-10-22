package dev.kuito.runtime

/**
 * Choreographer's clock for a drain between its frames: its latest frame at
 * or before now. The frame callback that follows a touch is never earlier,
 * so the UI kernel's animations never step back (docs/native-scheduling.md#input).
 *
 * The interval is the display's refresh period, not the gap between two
 * frame callbacks: those are posted only while there is work, so the gap
 * spans idle time and dropped frames. Main thread only.
 */
internal class KuitoFrameClock(
    /** The display's refresh rate in Hz, read at each drain since it changes; 0 without a display. */
    private val refreshRate: () -> Float,
) {
    private var frameNanos = 0L

    fun frame(frameTimeNanos: Long) {
        frameNanos = frameTimeNanos
    }

    /** In milliseconds, the unit `uiDrain` takes. Before a first frame, now. */
    fun latest(nowNanos: Long): Double {
        val now = nowNanos / 1_000_000.0
        val rate = refreshRate()

        if (frameNanos == 0L || rate <= 0f) return now
        return latestFrame(now, frameNanos / 1_000_000.0, 1000.0 / rate)
    }

    companion object {
        init {
            System.loadLibrary("kuito_mobile")
        }

        /** `kuito::latestFrame` (native/shared/FrameClock.h), the one iOS's input drain uses. */
        @JvmStatic private external fun latestFrame(now: Double, timestamp: Double, interval: Double): Double
    }
}
