package dev.kuito.runtime.devtools

import android.content.Context
import android.view.MotionEvent
import android.view.View

/**
 * While the Components panel inspects (docs/devtools.md), a tap anywhere
 * picks the view under it instead of reaching the app: [onPick] gets the
 * tap in screen coordinates.
 */
class KuitoInspectOverlay(context: Context, private val onPick: (Float, Float) -> Unit) : View(context) {
    init {
        setBackgroundColor(KuitoDevTheme.withAlpha(KuitoDevTheme.accent, 0.06f))
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_UP) {
            performClick()
            onPick(event.rawX, event.rawY)
        }

        return true
    }

    override fun performClick(): Boolean = super.performClick()
}
