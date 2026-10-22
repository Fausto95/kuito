package dev.kuito.runtime.modules.brightness

import android.provider.Settings
import android.view.WindowManager
import dev.kuito.link.BrightnessSpec
import dev.kuito.runtime.modules.KuitoModuleContext

/**
 * `Brightness` in native/modules/brightness/brightness.ts. The level is the window's own, so
 * the system's comes back by itself whenever the app leaves the foreground.
 */
class KuitoBrightnessModule(private val context: KuitoModuleContext) : BrightnessSpec {
    private val window get() = context.activity.window

    override fun getBrightness(): Double = window.attributes.screenBrightness.takeIf { it >= 0 }?.toDouble() ?: system()

    override fun setBrightness(level: Double) = set(level.toFloat())

    override fun restoreSystemBrightness() = restore()

    override fun isUsingSystemBrightness() =
        window.attributes.screenBrightness == WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE

    override fun destroy() = restore()

    private fun set(level: Float) {
        window.attributes = window.attributes.apply { screenBrightness = level }
    }

    private fun restore() = set(WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE)

    // The system setting runs from 0 to 255.
    private fun system() =
        Settings.System.getInt(context.activity.contentResolver, Settings.System.SCREEN_BRIGHTNESS, 128) / 255.0
}
