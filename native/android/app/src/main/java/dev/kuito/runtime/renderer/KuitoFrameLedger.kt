package dev.kuito.runtime.renderer

/**
 * The main thread's frame receipts (native/shared/FrameLedger.h,
 * docs/performance.md#frame-receipts). Main thread only. Calls behind
 * [KuitoCost.Counts.ENABLED] are dropped from release builds; a build
 * without receipts records nothing.
 */
internal object KuitoFrameLedger {
    /** The ledger's clock, in seconds. */
    external fun now(): Double

    /** A layout's views placed since [start]: [framed] of them, [wasted] where they were. */
    external fun recordFrames(start: Double, framed: Int, wasted: Int)

    /** A label drawn, [seconds] long: added to the frame's redraw receipt. */
    external fun addRedraw(seconds: Double)

    /** The main thread started a message, or finished it. */
    external fun woke()
    external fun slept()

    /**
     * The display frame for the vsync at [vsync], [interval] apart (seconds):
     * closes the frame's receipts and keeps them when it dropped. Returns the
     * work in seconds and the frames dropped.
     */
    external fun frame(vsync: Double, interval: Double): DoubleArray

    /** Counts up with each drop kept; 0 before any. */
    external fun dropSequence(): Long

    /** Whether the last drop's frame did Kuito work worth a report. */
    external fun lastDropReceipted(): Boolean

    /** The views the last drop's causes name. */
    external fun lastDropViews(): IntArray

    /** The last drop as one line, each of [views] named by [names]. */
    external fun describeLastDrop(views: IntArray, names: Array<String>): String

    /** The last drop as one line, [name] naming a view by its number. */
    fun describeLastDrop(name: (Int) -> String): String {
        val views = lastDropViews().distinct().toIntArray()

        return describeLastDrop(views, Array(views.size) { name(views[it]) })
    }

    /** For tests: forgets every receipt and drop. */
    external fun reset()

    /** For tests: job [job] applies a batch now, for [event] on view [view]. */
    external fun applyJob(job: Long, event: String, view: Int)

    /** For tests: the last drop's receipts, oldest first, each "kind ms cause counts…". */
    external fun lastDropReceipts(): Array<String>

    init {
        System.loadLibrary("kuito_mobile")
    }
}
