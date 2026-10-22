package dev.kuito.runtime.renderer.views

import android.annotation.SuppressLint
import android.content.Context
import android.view.View
import android.view.ViewGroup
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.color.MaterialColors

/**
 * One screen in a stack: its header, clear of the status bar where the stack
 * meets it, over the screen's content. A page is what transitions move. It is
 * opaque, as the platform's own screens are, so a transition never shows the
 * screen beneath through it.
 */
@SuppressLint("ViewConstructor")
internal class KuitoNavigationPage(context: Context, val screen: KuitoNavigationScreenLayout) : ViewGroup(context) {
    private val header = screen.headerBar

    /** The part of the status bar (and cutout) over this page, in px; the header sits below it. */
    private var statusInset = 0

    init {
        setBackgroundColor(MaterialColors.getColor(screen.header, com.google.android.material.R.attr.colorSurface))
        addView(header, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
        addView(screen, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    private val headerBottom get() = if (header.visibility == View.GONE) 0 else statusInset + header.measuredHeight

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val width = MeasureSpec.getSize(widthSpec)
        val height = MeasureSpec.getSize(heightSpec)

        if (header.visibility != View.GONE)
            header.measure(exactly(width), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED))

        screen.measure(exactly(width), exactly((height - headerBottom).coerceAtLeast(0)))
        setMeasuredDimension(width, height)
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        val width = right - left

        if (header.visibility != View.GONE) header.layout(0, statusInset, width, headerBottom)

        screen.layout(0, headerBottom, width, bottom - top)
        updateStatusInset()
    }

    /** Like SafeAreaView, only the overlap counts: a stack below the status bar gets none. */
    private fun updateStatusInset() {
        val insets = ViewCompat.getRootWindowInsets(this)
            ?.getInsets(WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.displayCutout())
            ?: return
        // The stack's position: a page's own moves with transitions and the back preview.
        val position = IntArray(2).also { (parent as? View ?: this).getLocationInWindow(it) }
        val inset = (insets.top - position[1]).coerceAtLeast(0)

        if (inset == statusInset) return

        statusInset = inset
        // After this layout pass, so the next one places the header below it.
        post(::requestLayout)
    }

    private fun exactly(size: Int) = MeasureSpec.makeMeasureSpec(size, MeasureSpec.EXACTLY)
}
