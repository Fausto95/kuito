package dev.kuito.runtime.modules.haptics

import android.os.Build
import android.os.Vibrator
import android.os.VibratorManager
import android.view.HapticFeedbackConstants
import dev.kuito.link.HapticsSpec
import dev.kuito.link.ImpactStyle
import dev.kuito.link.NotificationType
import dev.kuito.runtime.modules.KuitoModuleContext

/**
 * `Haptics` in native/modules/haptics/haptics.ts. View haptics need no
 * VIBRATE permission and follow the system's touch feedback setting.
 */
class KuitoHapticsModule(private val context: KuitoModuleContext) : HapticsSpec {
    override fun isSupported() = vibrator().hasVibrator()

    override fun selection() = perform(HapticFeedbackConstants.CLOCK_TICK)

    override fun impact(style: ImpactStyle) = perform(
        when (style) {
            ImpactStyle.LIGHT -> HapticFeedbackConstants.VIRTUAL_KEY
            ImpactStyle.MEDIUM -> HapticFeedbackConstants.CONTEXT_CLICK
            ImpactStyle.HEAVY -> HapticFeedbackConstants.LONG_PRESS
        },
    )

    override fun notification(type: NotificationType) = perform(
        when (type) {
            NotificationType.SUCCESS ->
                if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.CONTEXT_CLICK
            NotificationType.WARNING -> HapticFeedbackConstants.LONG_PRESS
            NotificationType.ERROR ->
                if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
        },
    )

    private fun perform(feedback: Int) {
        context.activity.window.decorView.performHapticFeedback(feedback)
    }

    private fun vibrator(): Vibrator =
        if (Build.VERSION.SDK_INT >= 31)
            context.activity.getSystemService(VibratorManager::class.java).defaultVibrator
        else
            @Suppress("DEPRECATION") context.activity.getSystemService(Vibrator::class.java)
}
