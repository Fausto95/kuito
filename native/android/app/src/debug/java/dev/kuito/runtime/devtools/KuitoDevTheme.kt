package dev.kuito.runtime.devtools

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import kotlin.math.roundToInt

/** The dev shell's look: deep ink surfaces, one electric accent, status colors. */
object KuitoDevTheme {
    val ink = Color.rgb(10, 10, 18)
    val surface = Color.rgb(23, 23, 33)
    val raised = Color.rgb(33, 33, 46)
    val hairline = Color.argb(20, 255, 255, 255)
    val text = Color.rgb(245, 245, 247)
    val muted = Color.rgb(158, 158, 168)
    val accent = Color.rgb(124, 92, 255)
    val success = Color.rgb(52, 211, 153)
    val warning = Color.rgb(250, 191, 36)
    val danger = Color.rgb(248, 113, 113)

    fun dp(context: Context, value: Float) = (value * context.resources.displayMetrics.density).roundToInt()

    fun rounded(context: Context, color: Int, radius: Float, stroke: Int? = hairline) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(context, radius).toFloat()
        stroke?.let { setStroke(dp(context, 1f), it) }
    }

    /** A dev bottom sheet's surface: rounded on top, flush with the screen's bottom edge. */
    fun sheet(context: Context) = GradientDrawable().apply {
        val radius = dp(context, 28f).toFloat()

        setColor(ink)
        cornerRadii = floatArrayOf(radius, radius, radius, radius, 0f, 0f, 0f, 0f)
    }

    fun withAlpha(color: Int, alpha: Float) = Color.argb((alpha * 255).roundToInt(), Color.red(color), Color.green(color), Color.blue(color))
}
