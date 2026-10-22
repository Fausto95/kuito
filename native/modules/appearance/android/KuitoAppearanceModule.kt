package dev.kuito.runtime.modules.appearance

import android.content.ComponentCallbacks
import android.content.res.Configuration
import dev.kuito.link.AppearanceSpec
import dev.kuito.link.ColorSchemeName
import dev.kuito.runtime.link.KuitoSignal
import dev.kuito.runtime.modules.KuitoModuleContext

/**
 * `Appearance` in native/modules/appearance/appearance.ts. The manifest
 * handles `uiMode` and `fontScale`, so dark mode and a font scale change
 * reach a running app as a configuration change; the renderer rescales its
 * text for the new scale.
 */
class KuitoAppearanceModule(private val context: KuitoModuleContext) : AppearanceSpec {
    private val schemes = mapOf(
        Configuration.UI_MODE_NIGHT_YES to ColorSchemeName.DARK,
        Configuration.UI_MODE_NIGHT_NO to ColorSchemeName.LIGHT,
    )
    private val callbacks = mutableMapOf<String, ComponentCallbacks>()

    // The resources' configuration is replaced, not mutated, on a change: safe to read from the JS thread.
    override fun colorScheme() = colorScheme(context.activity.resources.configuration)

    override fun fontScale() = fontScale(context.activity.resources.configuration)

    override fun startColorScheme(signal: KuitoSignal<ColorSchemeName?>) = observe("colorScheme", ::colorScheme, signal::set)

    override fun stopColorScheme() = stop("colorScheme")

    override fun startFontScale(signal: KuitoSignal<Double>) = observe("fontScale", ::fontScale, signal::set)

    override fun stopFontScale() = stop("fontScale")

    private fun colorScheme(configuration: Configuration) = schemes[configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK]

    // Through its decimal text: widening the Float turns 1.3 into 1.2999999523.
    private fun fontScale(configuration: Configuration) = configuration.fontScale.toString().toDouble()

    /** Sends a preference when a configuration change changes it. */
    private fun <T> observe(key: String, read: (Configuration) -> T, send: (T) -> Unit) {
        var last = read(context.activity.resources.configuration)
        val observer = object : ComponentCallbacks {
            override fun onConfigurationChanged(configuration: Configuration) {
                val next = read(configuration)

                if (next == last) return

                last = next
                send(next)
            }

            @Deprecated("Superseded by onTrimMemory; nothing to release here.")
            override fun onLowMemory() {}
        }

        callbacks[key] = observer
        context.activity.registerComponentCallbacks(observer)
    }

    private fun stop(key: String) {
        callbacks.remove(key)?.let(context.activity::unregisterComponentCallbacks)
    }
}
