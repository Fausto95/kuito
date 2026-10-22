package dev.kuito.runtime.devtools

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.os.SystemClock
import android.text.TextPaint
import android.text.TextUtils
import android.view.View
import java.util.IdentityHashMap

/**
 * Flashes an outline over each view the renderer updates, like react-scan:
 * green for a first update, amber then red as the same view keeps updating
 * within a second, with a count badge and the signal write that caused it.
 * It never takes touches.
 */
class KuitoUpdateHighlighter(context: Context) : View(context) {
    private class Flash(val rect: RectF, val color: Int, val count: Int, val start: Long, val cause: String?)

    private val pending = IdentityHashMap<View, Unit>()
    /** The write behind each pending update, as the kernel names it. */
    private val causes = IdentityHashMap<View, String>()
    private val recent = IdentityHashMap<View, MutableList<Long>>()
    private val flashes = mutableListOf<Flash>()
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = KuitoDevTheme.dp(context, 2f).toFloat()
    }
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val badge = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = KuitoDevTheme.dp(context, 10f).toFloat()
        typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
        textAlign = Paint.Align.CENTER
    }
    private val label = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = KuitoDevTheme.dp(context, 10f).toFloat()
        typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
    }
    private var scheduled = false
    /** The Components panel's selection: outlines that stay until replaced. */
    private var outlines = listOf<View>()
    val hasOutlines get() = outlines.isNotEmpty()

    /** Outlines [views] until the next call; none clears them. */
    fun outline(views: List<View>) {
        outlines = views
        invalidate()
    }

    init {
        isClickable = false
        isFocusable = false
    }

    /** [view]'s next flash names [cause]; the kernel sends it with the update. */
    fun caused(view: View, cause: String) {
        causes[view] = cause
    }

    /** Several updates to one view in a frame flash once. */
    fun updated(view: View) {
        pending[view] = Unit

        if (scheduled) return

        scheduled = true
        postOnAnimation(::flush)
    }

    private fun flush() {
        scheduled = false

        val now = SystemClock.uptimeMillis()
        val origin = IntArray(2).also(::getLocationInWindow)

        for (view in pending.keys) {
            if (!view.isAttachedToWindow || view.width == 0 || view.height == 0) continue

            val times = recent.getOrPut(view) { mutableListOf() }.apply {
                removeAll { now - it >= 1000 }
                add(now)
            }
            val at = IntArray(2).also(view::getLocationInWindow)
            val left = (at[0] - origin[0]).toFloat()
            val top = (at[1] - origin[1]).toFloat()
            val color = if (times.size >= 5) KuitoDevTheme.danger else if (times.size >= 2) KuitoDevTheme.warning else KuitoDevTheme.success

            flashes += Flash(RectF(left, top, left + view.width, top + view.height), color, times.size, now, causes[view])
        }

        pending.clear()
        causes.clear()
        recent.entries.removeAll { (_, times) -> times.none { now - it < 1000 } }
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val now = SystemClock.uptimeMillis()
        val radius = KuitoDevTheme.dp(context, 6f).toFloat()

        flashes.removeAll { now - it.start >= DURATION }

        for (flash in flashes) {
            val alpha = 1f - (now - flash.start) / DURATION.toFloat()

            fill.color = KuitoDevTheme.withAlpha(flash.color, 0.08f * alpha)
            stroke.color = KuitoDevTheme.withAlpha(flash.color, alpha)
            canvas.drawRoundRect(flash.rect, radius, radius, fill)
            canvas.drawRoundRect(flash.rect, radius, radius, stroke)

            if (flash.count > 1) {
                val width = KuitoDevTheme.dp(context, 26f).toFloat()
                val height = KuitoDevTheme.dp(context, 14f).toFloat()
                val box = RectF(flash.rect.right - width - 2, flash.rect.top, flash.rect.right - 2, flash.rect.top + height)

                fill.color = KuitoDevTheme.withAlpha(flash.color, alpha)
                canvas.drawRoundRect(box, 4f, 4f, fill)
                badge.color = KuitoDevTheme.withAlpha(KuitoDevTheme.ink, alpha)
                canvas.drawText("×${flash.count}", box.centerX(), box.bottom - height * 0.25f, badge)
            }

            flash.cause?.let { drawCause(canvas, it, flash, alpha) }
        }

        val origin = IntArray(2).also(::getLocationInWindow)

        for (view in outlines) {
            if (!view.isAttachedToWindow) continue

            val at = IntArray(2).also(view::getLocationInWindow)
            val rect = RectF(
                (at[0] - origin[0]).toFloat(),
                (at[1] - origin[1]).toFloat(),
                (at[0] - origin[0] + view.width).toFloat(),
                (at[1] - origin[1] + view.height).toFloat(),
            )

            fill.color = KuitoDevTheme.withAlpha(KuitoDevTheme.accent, 0.18f)
            stroke.color = KuitoDevTheme.accent
            canvas.drawRoundRect(rect, radius, radius, fill)
            canvas.drawRoundRect(rect, radius, radius, stroke)
        }

        if (flashes.isNotEmpty()) postInvalidateOnAnimation()
    }

    /** The cause, in a pill under the flash, or over it at the bottom of the screen. */
    private fun drawCause(canvas: Canvas, text: String, flash: Flash, alpha: Float) {
        val pad = KuitoDevTheme.dp(context, 5f).toFloat()
        val height = KuitoDevTheme.dp(context, 16f).toFloat()
        val width = minOf(label.measureText(text) + pad * 2, this.width - 4f)
        val top = if (flash.rect.bottom + height + 2 <= this.height) flash.rect.bottom + 2 else flash.rect.top - height - 2
        val left = maxOf(2f, minOf(flash.rect.left, this.width - width - 2))
        val box = RectF(left, top, left + width, top + height)
        val shown = TextUtils.ellipsize(text, TextPaint(label), width - pad * 2, TextUtils.TruncateAt.END).toString()

        fill.color = KuitoDevTheme.withAlpha(flash.color, alpha)
        canvas.drawRoundRect(box, 4f, 4f, fill)
        label.color = KuitoDevTheme.withAlpha(KuitoDevTheme.ink, alpha)
        canvas.drawText(shown, box.left + pad, box.bottom - height * 0.3f, label)
    }

    private companion object {
        const val DURATION = 700L
    }
}
