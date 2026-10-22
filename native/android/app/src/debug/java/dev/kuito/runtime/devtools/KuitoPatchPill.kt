package dev.kuito.runtime.devtools

import android.content.Context
import android.graphics.Typeface
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView

/**
 * A pill under the status bar for Live Patch and the dev link: "Updating…",
 * "Updated in 18 ms", failures (tap for the devtools) and lost connections.
 */
class KuitoPatchPill(context: Context, onTap: () -> Unit) : LinearLayout(context) {
    private val dot = View(context)
    private val text = TextView(context)
    private val hide = Runnable { animate().alpha(0f).translationY(-dp(8f).toFloat()).setDuration(300).start() }

    init {
        alpha = 0f
        gravity = Gravity.CENTER_VERTICAL
        background = KuitoDevTheme.rounded(context, KuitoDevTheme.withAlpha(KuitoDevTheme.ink, 0.92f), 17f)
        elevation = dp(8f).toFloat()
        setPadding(dp(14f), dp(8f), dp(16f), dp(8f))
        text.textSize = 13f
        text.typeface = Typeface.DEFAULT_BOLD
        text.setTextColor(KuitoDevTheme.text)
        addView(dot, LayoutParams(dp(8f), dp(8f)))
        addView(text, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply { marginStart = dp(8f) })
        setOnClickListener { onTap() }
    }

    fun updating() = show("Updating…", KuitoDevTheme.warning, null)

    fun updated(milliseconds: Double) = show("Updated in %.0f ms".format(milliseconds), KuitoDevTheme.success, 1600)

    fun disconnected(retryingInMs: Long) =
        show("Dev server disconnected · retrying in ${(retryingInMs + 999) / 1000}s", KuitoDevTheme.warning, null)

    fun reconnected() = show("Reconnected", KuitoDevTheme.success, 1400)

    fun failed() = show("Update failed · tap for details", KuitoDevTheme.danger, null)

    private fun show(message: String, color: Int, durationMs: Long?) {
        removeCallbacks(hide)
        text.text = message
        dot.background = KuitoDevTheme.rounded(context, color, 4f, null)
        isClickable = durationMs == null
        animate().alpha(1f).translationY(0f).setDuration(250).start()

        durationMs?.let { postDelayed(hide, it) }
    }

    private fun dp(value: Float) = KuitoDevTheme.dp(context, value)
}
