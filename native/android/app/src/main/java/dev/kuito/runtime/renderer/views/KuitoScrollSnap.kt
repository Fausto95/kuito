package dev.kuito.runtime.renderer.views

import kotlin.math.abs

/**
 * Where a drag on a paging or snapping scroll view comes to rest. Android's
 * scroll views do neither, so they settle here when a fling or a drag ends;
 * iOS's KuitoScrollSnap follows the same rule.
 */
internal class KuitoScrollSnap {
    var paging = false
    /** Where a drag may come to rest, in px along the axis; unused while paging. */
    var offsets: List<Int> = emptyList()

    /**
     * The offset to settle at, or null when nothing snaps. Paging moves at
     * most one page from where the finger let go, however far a fling would go.
     */
    fun rest(current: Int, projected: Int, velocity: Int, page: Int, maximum: Int): Int? = when {
        paging && page > 0 -> restingOffset((0..maximum / page).map { it * page }, current, current, velocity, maximum)
        offsets.isNotEmpty() -> restingOffset(offsets, current, projected, velocity, maximum)
        else -> null
    }

    companion object {
        /**
         * The point nearest where scrolling would stop (`projected`), moving
         * on to the next one in the fling's direction rather than back behind
         * where the finger let go (`current`). The start and the end are
         * points too, so content past the last one stays reachable.
         */
        fun restingOffset(points: List<Int>, current: Int, projected: Int, velocity: Int, maximum: Int): Int {
            val resting = (points.map { it.coerceIn(0, maximum) } + listOf(0, maximum)).distinct().sorted()
            val nearest = resting.minBy { abs(it - projected) }

            return when {
                velocity > 0 && nearest < current -> resting.firstOrNull { it >= current } ?: nearest
                velocity < 0 && nearest > current -> resting.lastOrNull { it <= current } ?: nearest
                else -> nearest
            }
        }
    }
}
