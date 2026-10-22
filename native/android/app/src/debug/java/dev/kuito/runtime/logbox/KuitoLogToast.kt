package dev.kuito.runtime.logbox

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import dev.kuito.runtime.devtools.KuitoDevTheme

/**
 * The LogBox at rest: one compact bar above the navigation bar with the
 * latest entry and what else is waiting. It never covers more than itself.
 */
class KuitoLogToast(context: Context, onOpen: () -> Unit, onDismiss: () -> Unit) : LinearLayout(context) {
    private val badge = TextView(context)
    private val title = TextView(context)
    private val summary = TextView(context)
    private var shown = false

    init {
        alpha = 0f
        visibility = GONE
        gravity = Gravity.CENTER_VERTICAL
        background = KuitoDevTheme.rounded(context, KuitoDevTheme.withAlpha(KuitoDevTheme.raised, 0.97f), 18f)
        elevation = dp(12f).toFloat()
        setPadding(dp(12f), dp(10f), dp(4f), dp(10f))

        badge.gravity = Gravity.CENTER
        badge.textSize = 13f
        badge.typeface = Typeface.DEFAULT_BOLD
        badge.setTextColor(Color.BLACK)
        badge.minWidth = dp(26f)
        badge.setPadding(dp(6f), 0, dp(6f), 0)
        title.textSize = 15f
        title.typeface = Typeface.DEFAULT_BOLD
        title.setTextColor(KuitoDevTheme.text)
        title.maxLines = 1
        title.ellipsize = TextUtils.TruncateAt.END
        summary.textSize = 12f
        summary.setTextColor(KuitoDevTheme.muted)

        val lines = LinearLayout(context).apply {
            orientation = VERTICAL
            addView(title)
            addView(summary)
        }
        val close = TextView(context).apply {
            text = "✕"
            textSize = 16f
            gravity = Gravity.CENTER
            setTextColor(KuitoDevTheme.muted)
            contentDescription = "Dismiss all"
            setOnClickListener { onDismiss() }
        }

        addView(badge, LayoutParams(LayoutParams.WRAP_CONTENT, dp(26f)))
        addView(lines, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(12f) })
        addView(close, LayoutParams(dp(44f), dp(44f)))
        setOnClickListener { onOpen() }
    }

    /** Shows the newest entry; hides when the LogBox is empty. */
    fun show(logBox: KuitoLogBox) {
        val latest = logBox.entries.lastOrNull() ?: return hide()
        val errors = logBox.count(KuitoLogBox.Level.ERROR)
        val warnings = logBox.count(KuitoLogBox.Level.WARN)
        val warn = latest.level == KuitoLogBox.Level.WARN

        badge.background = KuitoDevTheme.rounded(context, if (warn) KuitoDevTheme.warning else KuitoDevTheme.danger, 13f, null)
        badge.text = if (latest.count > 1) "${latest.count}" else if (warn) "!" else "×"
        title.text = latest.title
        summary.text = listOfNotNull(
            if (errors > 0) "$errors ${if (errors == 1) "error" else "errors"}" else null,
            if (warnings > 0) "$warnings ${if (warnings == 1) "warning" else "warnings"}" else null,
            "tap to inspect",
        ).joinToString(" · ")

        if (shown) return

        shown = true
        visibility = VISIBLE
        translationY = dp(40f).toFloat()
        animate().alpha(1f).translationY(0f).setDuration(320).start()
    }

    private fun hide() {
        if (!shown) return

        shown = false
        animate().alpha(0f).translationY(dp(30f).toFloat()).setDuration(200)
            .withEndAction { if (!shown) visibility = View.GONE }.start()
    }

    private fun dp(value: Float) = KuitoDevTheme.dp(context, value)
}
