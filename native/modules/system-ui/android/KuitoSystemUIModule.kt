package dev.kuito.runtime.modules.systemui

import android.content.res.Resources
import dev.kuito.link.NavigationBarButtonStyle
import dev.kuito.link.StatusBarStyle
import dev.kuito.link.StatusBarTransition
import dev.kuito.link.SystemUISpec
import dev.kuito.runtime.modules.KuitoModuleContext
import dev.kuito.runtime.renderer.styling.cssColor

/**
 * `SystemUI` in native/modules/system-ui/system-ui.ts. The home indicator
 * and deferred screen edges are iOS's, and resolve without effect here.
 */
class KuitoSystemUIModule(private val context: KuitoModuleContext) : SystemUISpec {
    // Created on the UI thread, by the first call that needs it.
    private var created: KuitoSystemBars? = null
    private val bars get() = created ?: KuitoSystemBars(context.activity).also { created = it }

    /** True for light text and icons; `default` is null, the style the app launched with. */
    override fun setStatusBarStyle(style: StatusBarStyle, animated: Boolean) {
        bars.setStatusBarStyle(
            when (style) {
                StatusBarStyle.DEFAULT -> null
                StatusBarStyle.LIGHT_CONTENT -> true
                StatusBarStyle.DARK_CONTENT -> false
            },
        )
    }

    // Android shows and hides its bars with its own animation.
    override fun setStatusBarHidden(hidden: Boolean, transition: StatusBarTransition) {
        bars.setStatusBarHidden(hidden)
    }

    override fun setStatusBarBackgroundColor(color: String, animated: Boolean) {
        bars.setStatusBarColor(cssColor(color), animated)
    }

    override fun setStatusBarTranslucent(translucent: Boolean) {
        bars.setTranslucent(translucent)
    }

    /** In dp, from the system's resources as React Native reads it: safe off the UI thread. */
    override fun statusBarHeight(): Double? {
        val resources = Resources.getSystem()
        val id = resources.getIdentifier("status_bar_height", "dimen", "android")

        return if (id == 0) null else resources.getDimensionPixelSize(id) / resources.displayMetrics.density.toDouble()
    }

    override fun statusBarHiddenAtLaunch() = context.activity.statusBarHiddenAtLaunch()

    override fun setBackgroundColor(color: String?) {
        bars.setBackgroundColor(color?.let(::cssColor))
    }

    override fun setNavigationBarColor(color: String) {
        bars.setNavigationBarColor(cssColor(color))
    }

    /** True for light buttons; `default` is null, the shell's own, for a SystemBars that gives them back. */
    override fun setNavigationBarButtonStyle(style: NavigationBarButtonStyle) {
        bars.setNavigationBarButtonStyle(
            when (style) {
                NavigationBarButtonStyle.LIGHT -> true
                NavigationBarButtonStyle.DARK -> false
                NavigationBarButtonStyle.DEFAULT -> null
            },
        )
    }

    override fun setNavigationBarHidden(hidden: Boolean) {
        bars.setNavigationBarHidden(hidden)
    }

    override fun setScreenEdgesDeferred(deferred: Boolean) {}

    override fun setHomeIndicatorAutoHidden(hidden: Boolean) {}

    override fun destroy() {
        created?.reset()
    }
}
