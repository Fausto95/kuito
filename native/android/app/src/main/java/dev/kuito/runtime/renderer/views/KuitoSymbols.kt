package dev.kuito.runtime.renderer.views

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import dev.kuito.runtime.R
import kotlin.math.ceil
import kotlin.math.roundToInt
import dev.kuito.runtime.renderer.KuitoRenderError

/**
 * Material Symbols, Android's counterpart of SF Symbols: the outlined font
 * (res/font/material_symbols.ttf, Apache 2.0, LICENSE-material-symbols) draws
 * any symbol by name through its ligatures.
 */
internal object KuitoSymbols {
    /** Material's icon size, which the bottom bar shows. */
    const val SIZE_DP = 24f

    /**
     * The font has one weight, regular: heavier weights stroke the glyph's
     * outline, by this fraction of its size, and lighter ones draw it regular.
     */
    private val emboldening = mapOf(
        "medium" to 0.01f,
        "semibold" to 0.02f,
        "bold" to 0.03f,
        "heavy" to 0.04f,
        "black" to 0.05f,
    )

    val weights = setOf("ultralight", "thin", "light", "regular") + emboldening.keys

    private var typeface: Typeface? = null

    /** The symbol in white, which the view tints, `sizeDp` square. */
    fun drawable(
        context: Context,
        name: String,
        sizeDp: Float = SIZE_DP,
        weight: String = "regular",
    ): Drawable {
        val paint = paint(context, sizeDp, weight)

        // A name without a ligature would draw as letters.
        if (!paint.hasGlyph(name)) throw KuitoRenderError.Rejection("no Material Symbol is named $name (fonts.google.com/icons)")

        val size = paint.textSize
        val pixels = ceil(size + paint.strokeWidth).toInt().coerceAtLeast(1)
        val bitmap = Bitmap.createBitmap(pixels, pixels, Bitmap.Config.ARGB_8888)
        val inset = paint.strokeWidth / 2

        // Each symbol fills one em square standing on the baseline.
        Canvas(bitmap).drawText(name, inset, size + inset, paint)

        return BitmapDrawable(context.resources, bitmap)
    }

    private fun paint(context: Context, sizeDp: Float, weight: String): Paint {
        val face = typeface ?: context.resources.getFont(R.font.material_symbols).also { typeface = it }
        val size = (sizeDp * context.resources.displayMetrics.density).roundToInt().coerceAtLeast(1).toFloat()
        val bold = emboldening[weight] ?: 0f

        return Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = face
            textSize = size
            color = Color.WHITE
            if (bold > 0f) {
                style = Paint.Style.FILL_AND_STROKE
                strokeWidth = size * bold
                strokeJoin = Paint.Join.ROUND
            }
        }
    }
}
