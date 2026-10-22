package dev.kuito.runtime.renderer.styling

import android.graphics.Color

/** A native module's color text, counted as a parse. */
fun cssColor(value: Any?): Int {
    val text = KuitoParses.of(value)?.toString() ?: return Color.TRANSPARENT

    return hexColor(text)
}

/** CSS hex (#rgb, #rgba, #rrggbb, #rrggbbaa) to an Android color int, as a JSON prop's colors arrive; black for anything else. */
fun hexColor(text: String): Int = hexDigitsColor(text.trim().removePrefix("#")) ?: Color.BLACK

/** CSS hex (#rgb, #rgba, #rrggbb, #rrggbbaa) to an Android color int; null for anything else. */
fun strictHexColor(text: String): Int? = text.trim().takeIf { it.startsWith("#") }?.let { hexDigitsColor(it.drop(1)) }

/** 3, 4, 6 or 8 hex digits to an Android color int; alpha is last in CSS. */
private fun hexDigitsColor(hex: String): Int? {
    if (hex.length !in setOf(3, 4, 6, 8) || !hex.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }) return null

    val full = if (hex.length == 3 || hex.length == 4) hex.map { "$it$it" }.joinToString("") else hex
    val rgba = full.toLong(16)

    return if (full.length == 6) (0xFF000000 or rgba).toInt() else (((rgba and 0xFF) shl 24) or (rgba shr 8)).toInt()
}

/** A color the host batch parsed, 0xRRGGBBAA, as an Android color int (0xAARRGGBB). */
fun argb(rgba: Int): Int = (rgba ushr 8) or (rgba shl 24)
