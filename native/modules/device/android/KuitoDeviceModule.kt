package dev.kuito.runtime.modules.device

import android.app.ActivityManager
import android.app.UiModeManager
import android.content.res.Configuration
import android.os.Build
import dev.kuito.link.DeviceInfo
import dev.kuito.link.DeviceSpec
import dev.kuito.runtime.modules.KuitoModuleContext

/** `Device` in native/modules/device/device.ts. Build constants and system services, safe on the JS thread. */
class KuitoDeviceModule(private val context: KuitoModuleContext) : DeviceSpec {
    private companion object {
        // expo-device's DeviceType numbers.
        const val PHONE = 1
        const val TABLET = 2
        const val DESKTOP = 3
        const val TV = 4

        /** What the Android emulator's system images report; any one is enough. */
        val emulatorSigns: List<() -> Boolean> = listOf(
            { Build.FINGERPRINT.startsWith("generic") || Build.FINGERPRINT.contains("emulator") },
            { Build.HARDWARE == "goldfish" || Build.HARDWARE == "ranchu" },
            { Build.PRODUCT.contains("sdk") || Build.PRODUCT.contains("emulator") },
            { Build.MODEL.contains("Emulator") || Build.MODEL.contains("Android SDK built for") },
        )
    }

    override fun info() = DeviceInfo(
        isDevice = emulatorSigns.none { it() },
        brand = Build.BRAND,
        manufacturer = Build.MANUFACTURER,
        modelName = Build.MODEL,
        modelId = null,
        deviceType = deviceType().toDouble(),
        totalMemory = totalMemory(),
        osName = "Android",
        osVersion = Build.VERSION.RELEASE,
        osBuildId = Build.DISPLAY,
        platformApiLevel = Build.VERSION.SDK_INT.toDouble(),
    )

    // A tablet by its smallest width, as Android's own resource qualifiers decide.
    private fun deviceType(): Int {
        val activity = context.activity
        val modeType = activity.getSystemService(UiModeManager::class.java).currentModeType

        return when {
            modeType == Configuration.UI_MODE_TYPE_TELEVISION -> TV
            activity.packageManager.hasSystemFeature("android.hardware.type.pc") -> DESKTOP
            activity.resources.configuration.smallestScreenWidthDp >= 600 -> TABLET
            else -> PHONE
        }
    }

    private fun totalMemory(): Double {
        val memory = ActivityManager.MemoryInfo()

        context.activity.getSystemService(ActivityManager::class.java).getMemoryInfo(memory)

        return memory.totalMem.toDouble()
    }
}
