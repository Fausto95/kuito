package dev.kuito.runtime.renderer.gestures

import dev.kuito.runtime.renderer.KuitoGestureConfigEntryValue
import dev.kuito.runtime.renderer.KuitoHitSlopEdgesValue

/**
 * One gesture's `config` from the `gestures` prop: RNGH's native config keys,
 * lengths in dp. Plays the part of RNGH's ReadableMap plus PixelUtil: [px]
 * converts a length to pixels. A value of the wrong type is an error.
 */
internal class GestureConfig(private val entries: Map<String, KuitoGestureConfigEntryValue>, private val density: Float) {
    fun has(key: String) = key in entries

    fun isNull(key: String) = entries[key] == null

    fun isNumber(key: String) = entries[key] is KuitoGestureConfigEntryValue.Number

    fun boolean(key: String): Boolean = (entries[key] as? KuitoGestureConfigEntryValue.Flag)?.value ?: invalid(key, "a boolean")

    fun int(key: String): Int = number(key).toInt()

    fun long(key: String): Long = number(key).toLong()

    /** A length or speed in dp (per second), converted to pixels. */
    fun px(key: String): Float = (number(key) * density).toFloat()

    fun config(key: String) =
        GestureConfig((entries[key] as? KuitoGestureConfigEntryValue.Edges)?.value?.entries() ?: invalid(key, "an object"), density)

    private fun number(key: String): Double =
        (entries[key] as? KuitoGestureConfigEntryValue.Number)?.value?.takeIf { it.isFinite() } ?: invalid(key, "a finite number")

    private fun invalid(key: String, expected: String): Nothing =
        error("Unsupported gesture config: $key must be $expected, got ${quoted(entries[key])}")

    private fun quoted(entry: KuitoGestureConfigEntryValue?): String = when (entry) {
        null -> "nothing"
        is KuitoGestureConfigEntryValue.Number -> entry.value.toString()
        is KuitoGestureConfigEntryValue.Flag -> entry.value.toString()
        is KuitoGestureConfigEntryValue.Edges -> "an object"
    }

    /** A hit area's edges as config entries, the ones it sets only. */
    private fun KuitoHitSlopEdgesValue.entries(): Map<String, KuitoGestureConfigEntryValue> = listOf(
        "left" to left, "top" to top, "right" to right, "bottom" to bottom,
        "width" to width, "height" to height, "horizontal" to horizontal, "vertical" to vertical,
    ).mapNotNull { (edge, length) -> length?.let { edge to KuitoGestureConfigEntryValue.Number(it) } }.toMap()
}
