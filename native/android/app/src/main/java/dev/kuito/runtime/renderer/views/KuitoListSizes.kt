package dev.kuito.runtime.renderer.views

import kotlin.math.roundToInt

/**
 * A list's measured row sizes by key, in pixels, kept so a row seen before
 * returns at its size, and the length a row not measured yet takes: the
 * estimate, else the measured rows' average.
 */
internal class KuitoListSizes(private val horizontal: Boolean, private val density: () -> Float) {
    /** Width and height packed in one Long: rows can number in the thousands. */
    private val sizes = HashMap<String, Long>()
    private var measuredLength = 0L

    var estimatedPx: Int? = null

    /** A horizontal list's tallest row so far. */
    private var tallest = 0

    /** Records a row's size; true when a horizontal list's tallest row grew, so the list's own height did. */
    fun record(key: String, width: Int, height: Int): Boolean {
        val packed = (width.toLong() shl 32) or (height.toLong() and 0xffffffffL)
        val previous = sizes.put(key, packed)

        if (previous == packed) return false

        measuredLength += main(packed) - (previous?.let(::main) ?: 0)

        if (!horizontal || height <= tallest) return false

        tallest = height

        return true
    }

    fun placeholderLength(key: String?): Int =
        key?.let(sizes::get)?.let { main(it).toInt() } ?: estimatedPx ?: if (sizes.isEmpty()) (44 * density()).roundToInt()
        else (measuredLength / sizes.size).toInt()

    val crossExtent: Int get() = if (horizontal) tallest else sizes.values.maxOfOrNull { cross(it).toInt() } ?: 0

    private fun main(packed: Long) = if (horizontal) packed shr 32 else packed and 0xffffffffL

    private fun cross(packed: Long) = if (horizontal) packed and 0xffffffffL else packed shr 32
}
