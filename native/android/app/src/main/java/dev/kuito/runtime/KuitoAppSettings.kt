package dev.kuito.runtime

import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Bundle

/**
 * Settings from kuito.config.ts that the manifest and theme can't apply on
 * their own: the CLI writes them as <meta-data> (src/cli/app-settings.ts) and
 * the activity reads them here.
 */
class KuitoAppSettings(private val metaData: Bundle) {
    /**
     * The night bit a forced `colorScheme` overrides in the activity's
     * configuration, so resources, Material views and Appearance all see it;
     * null follows the system.
     */
    val nightMode: Int? = nightModes[metaData.getString("dev.kuito.colorScheme")]

    /** The root's color; aapt stores a `#RRGGBB` meta-data value as a color int. */
    val backgroundColor: Int? = "dev.kuito.backgroundColor".let { key ->
        if (metaData.containsKey(key)) metaData.getInt(key) else null
    }

    /** An override configuration carrying only the forced night mode. */
    fun configurationOverride(): Configuration? =
        nightMode?.let { mode -> Configuration().apply { uiMode = mode } }

    companion object {
        private val nightModes = mapOf(
            "light" to Configuration.UI_MODE_NIGHT_NO,
            "dark" to Configuration.UI_MODE_NIGHT_YES,
        )

        fun of(context: Context) = KuitoAppSettings(
            context.packageManager
                .getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
                .metaData ?: Bundle(),
        )
    }
}
