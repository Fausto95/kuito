package dev.kuito.runtime.renderer.styling

/**
 * Prop values the renderer turned from text into a value: a number, a color,
 * a flag, an enum, JSON. The host batch types every value, so only a native
 * module view, whose props arrive as scalars, pays a parse; the performance
 * monitor shows them per commit. Main thread only.
 */
object KuitoParses {
    var count = 0L
        private set

    /** `value`, counted when it is text about to be parsed. */
    fun <T> of(value: T): T {
        if (value is String) count++

        return value
    }
}
