package dev.kuito.runtime.modules.systemui

import android.animation.ValueAnimator
import android.app.Activity
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.updatePadding

/** kuito.config.ts's `statusBar.hidden` sets the theme's windowFullscreen. A theme read, safe off the UI thread. */
internal fun Activity.statusBarHiddenAtLaunch(): Boolean =
    theme.obtainStyledAttributes(intArrayOf(android.R.attr.windowFullscreen)).run { getBoolean(0, false).also { recycle() } }

/**
 * The system chrome around the app, on one activity's window. Android 15
 * draws every app edge to edge and ignores the window's bar colors, so each
 * bar's color is a scrim view in the decor view, sized to that bar's inset:
 * the same on every version. UI thread only.
 */
internal class KuitoSystemBars(private val activity: Activity) {
    private val window = activity.window
    private val decor = window.decorView as ViewGroup
    private val content = activity.findViewById<ViewGroup>(android.R.id.content)
    private val controller = WindowCompat.getInsetsController(window, decor)
    private val statusScrim = Scrim(Gravity.TOP) { it.getInsets(WindowInsetsCompat.Type.statusBars()).top }
    private val navigationScrim = Scrim(Gravity.BOTTOM) { it.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom }

    // What the shell set, given back on reset.
    private val shellLightStatusBars = controller.isAppearanceLightStatusBars
    private val shellLightNavigationBars = controller.isAppearanceLightNavigationBars
    private val shellBackground: Drawable? = decor.background
    private val shellContrastEnforced = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || window.isNavigationBarContrastEnforced

    private val statusBarHiddenAtLaunch = activity.statusBarHiddenAtLaunch()
    private var statusBarHidden = statusBarHiddenAtLaunch
    private var navigationBarHidden = false
    private var translucent = true

    /** Null is `default`: the style the app launched with, from its theme. */
    fun setStatusBarStyle(lightContent: Boolean?) {
        controller.isAppearanceLightStatusBars = lightContent?.not() ?: shellLightStatusBars
    }

    fun setStatusBarColor(color: Int, animated: Boolean) = statusScrim.fill(color, animated)

    fun setStatusBarHidden(hidden: Boolean) {
        statusBarHidden = hidden
        applyVisibility()
    }

    /** Opaque: the app lays out below the status bar, which its scrim fills. */
    fun setTranslucent(translucent: Boolean) {
        this.translucent = translucent
        // The status bar's scrim follows its inset, which the padding follows too.
        statusScrim.attached()
        ViewCompat.getRootWindowInsets(decor)?.let(::layOut)
    }

    fun setNavigationBarColor(color: Int) {
        navigationScrim.fill(color, animated = false)
        // The system's own scrim behind three-button navigation would tint the color.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
            window.isNavigationBarContrastEnforced = shellContrastEnforced && Color.alpha(color) == 0
    }

    /** Null gives the buttons back to the shell's theme. */
    fun setNavigationBarButtonStyle(lightButtons: Boolean?) {
        controller.isAppearanceLightNavigationBars = lightButtons?.not() ?: shellLightNavigationBars
    }

    fun setNavigationBarHidden(hidden: Boolean) {
        navigationBarHidden = hidden
        applyVisibility()
    }

    /** The root view's color, behind the app's views; null gives back the shell's. */
    fun setBackgroundColor(color: Int?) {
        decor.background = color?.let(::ColorDrawable) ?: shellBackground
    }

    fun reset() {
        statusScrim.remove()
        navigationScrim.remove()
        statusBarHidden = statusBarHiddenAtLaunch
        navigationBarHidden = false
        translucent = true
        applyVisibility()
        content.updatePadding(top = 0)
        controller.isAppearanceLightStatusBars = shellLightStatusBars
        controller.isAppearanceLightNavigationBars = shellLightNavigationBars
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) window.isNavigationBarContrastEnforced = shellContrastEnforced
        setBackgroundColor(null)
    }

    private fun applyVisibility() {
        // A swipe from the edge shows hidden bars for a moment, then they hide again.
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        show(WindowInsetsCompat.Type.statusBars(), !statusBarHidden)
        show(WindowInsetsCompat.Type.navigationBars(), !navigationBarHidden)
    }

    private fun show(types: Int, visible: Boolean) = if (visible) controller.show(types) else controller.hide(types)

    private fun layOut(insets: WindowInsetsCompat) {
        val top = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top

        content.updatePadding(top = if (translucent) 0 else top)
    }

    /** A bar's color: a view over the app, as tall as the bar, at its edge. */
    private inner class Scrim(private val gravity: Int, private val extent: (WindowInsetsCompat) -> Int) {
        private var view: View? = null
        private var animator: ValueAnimator? = null

        fun fill(color: Int, animated: Boolean) {
            val scrim = attached()
            val from = (scrim.background as? ColorDrawable)?.color ?: Color.TRANSPARENT

            animator?.cancel()
            if (!animated) return scrim.setBackgroundColor(color)

            animator = ValueAnimator.ofArgb(from, color).apply {
                duration = 300
                addUpdateListener { scrim.setBackgroundColor(it.animatedValue as Int) }
                start()
            }
        }

        fun remove() {
            animator?.cancel()
            view?.let(decor::removeView)
            view = null
        }

        fun attached(): View = view ?: attach()

        private fun attach(): View {
            val scrim = View(activity)

            ViewCompat.setOnApplyWindowInsetsListener(scrim) { _, insets ->
                scrim.layoutParams = scrim.layoutParams.apply { height = extent(insets) }
                if (gravity == Gravity.TOP) layOut(insets)
                insets
            }
            decor.addView(scrim, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, gravity))
            ViewCompat.requestApplyInsets(scrim)
            view = scrim

            return scrim
        }
    }
}
