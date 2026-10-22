package dev.kuito.runtime.renderer.views

import android.content.Context
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import dev.kuito.runtime.renderer.KuitoStyled
import dev.kuito.runtime.renderer.KuitoTreeLinks
import dev.kuito.runtime.renderer.layout.KuitoFlexLayout
import dev.kuito.runtime.renderer.styling.KuitoViewStyle

/**
 * SafeAreaView: pads its content by the part of it the system covers (status
 * bar, navigation bar, display cutout). Like UIKit's per-view safe area, only
 * the overlap counts, so a SafeAreaView away from the screen edges gets none.
 */
internal class KuitoSafeAreaLayout(context: Context) : KuitoFlexLayout(context), KuitoStyled {
    var edges = ALL
        set(value) {
            field = value
            requestLayout()
        }

    /** The style whose safe-area inset this view sets. */
    var style: KuitoViewStyle? = null

    override fun style(style: KuitoViewStyle, tree: KuitoTreeLinks) {
        this.style = style
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        super.onLayout(changed, left, top, right, bottom)
        updateInset()
    }

    private fun updateInset() {
        val insets = ViewCompat.getRootWindowInsets(this)
            ?.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            ?: return
        val position = IntArray(2).also(::getLocationInWindow)
        val window = rootView
        val density = resources.displayMetrics.density
        val overlap = floatArrayOf(
            (insets.top - position[1]).toFloat(),
            (insets.right - (window.width - position[0] - width)).toFloat(),
            (insets.bottom - (window.height - position[1] - height)).toFloat(),
            (insets.left - position[0]).toFloat(),
        )
        val inset = FloatArray(4) { side -> if (EDGES[side] in edges) overlap[side].coerceAtLeast(0f) / density else 0f }

        val style = style ?: return

        if (inset.contentEquals(style.safeAreaInset)) return

        style.safeAreaInset = inset
        // After this layout pass, so the next one applies the new inset.
        post { style.applyInset(this) }
    }

    companion object {
        private val EDGES = listOf("top", "right", "bottom", "left")
        val ALL = EDGES.toSet()
    }
}
