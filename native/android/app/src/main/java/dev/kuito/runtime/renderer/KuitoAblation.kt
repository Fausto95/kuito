package dev.kuito.runtime.renderer

/**
 * The what-if switchboard (native/shared/Ablation.h,
 * docs/performance.md#ablation), read once from the debug.kuito.ablate
 * system property. Calls behind [KuitoCost.Counts.ENABLED] are dropped from
 * release builds, which toggle nothing.
 */
internal object KuitoAblation {
    // kuito::Subsystem's numbers.
    const val LAYOUT = 0
    const val LABEL_REDRAW = 2

    /** Whether [subsystem]'s work is skipped. */
    external fun elides(subsystem: Int): Boolean

    /** Busy-waits as long as [subsystem] is slowed by, if it is. */
    external fun slow(subsystem: Int)

    /** What is toggled, as the property reads back; empty when nothing is. */
    external fun setting(): String

    /** Why the property did not read; empty when it did or is unset. */
    external fun error(): String

    init {
        System.loadLibrary("kuito_mobile")
    }
}
