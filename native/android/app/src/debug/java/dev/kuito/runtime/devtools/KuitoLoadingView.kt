package dev.kuito.runtime.devtools

import android.content.Context
import android.graphics.Typeface
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/**
 * The startup screen: shown until the app's first frame, with what the shell
 * is waiting for. It fades out as soon as there is something to show.
 *
 * It holds still. A spinner or a pulse redraws every frame, and on a one-core
 * device that time comes out of Hermes and the first commit (docs/performance.md).
 */
class KuitoLoadingView(context: Context) : FrameLayout(context) {
    private val status = TextView(context)
    private val mark = KuitoBrandMark(context)

    init {
        setBackgroundColor(KuitoDevTheme.ink)
        isClickable = true

        val title = TextView(context).apply {
            text = "Kuito"
            textSize = 26f
            setTextColor(KuitoDevTheme.text)
            typeface = Typeface.DEFAULT_BOLD
        }

        status.textSize = 15f
        status.setTextColor(KuitoDevTheme.muted)
        status.gravity = Gravity.CENTER

        addView(LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            addView(mark, LinearLayout.LayoutParams(dp(96f), dp(96f)))
            addView(title, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(24f) })
            addView(status, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(26f)
                leftMargin = dp(40f)
                rightMargin = dp(40f)
            })
        }, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
    }

    fun show(text: String) {
        status.text = text
    }

    fun finish() {
        animate().alpha(0f).scaleX(1.04f).scaleY(1.04f).setDuration(350).withEndAction {
            (parent as? ViewGroup)?.removeView(this)
        }.start()
    }

    private fun dp(value: Float) = KuitoDevTheme.dp(context, value)
}
