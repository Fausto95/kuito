package dev.kuito.runtime.renderer.views

import android.content.Context
import android.graphics.Canvas
import android.widget.TextView
import dev.kuito.runtime.renderer.KuitoAblation
import dev.kuito.runtime.renderer.KuitoCost
import dev.kuito.runtime.renderer.KuitoFrameLedger

/** Text: a TextView that counts its redraws in debug builds (KuitoCost). */
internal class KuitoLabel(context: Context) : TextView(context) {
    // What the label last drew: drawing it again at the same size wastes the draw.
    private var drawnText: CharSequence? = null
    private var drawnWidth = -1
    private var drawnHeight = -1
    private var drawnColor = 0

    override fun onDraw(canvas: Canvas) {
        if (KuitoCost.Counts.ENABLED) {
            KuitoAblation.slow(KuitoAblation.LABEL_REDRAW)
            if (KuitoAblation.elides(KuitoAblation.LABEL_REDRAW)) return

            KuitoCost.Counts.labelRedraws++
            if (drawnText?.toString() == text?.toString() && drawnWidth == width && drawnHeight == height && drawnColor == currentTextColor)
                KuitoCost.Counts.wastedRedraws++
            drawnText = text
            drawnWidth = width
            drawnHeight = height
            drawnColor = currentTextColor

            val started = KuitoFrameLedger.now()

            super.onDraw(canvas)
            KuitoFrameLedger.addRedraw(KuitoFrameLedger.now() - started)

            return
        }

        super.onDraw(canvas)
    }
}
