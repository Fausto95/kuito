package dev.kuito.runtime.modules.permissions

import android.Manifest.permission
import android.app.NotificationManager
import android.content.Context
import android.os.Build

private val sdk = Build.VERSION.SDK_INT

/**
 * A permission a module asks for: `PermissionName` in
 * native/modules/permissions/permissions.ts, matched by its constant in camel case. Each entry
 * is the table row for this device's API level; every runtime permission
 * named here is declared in the shell's AndroidManifest.xml.
 */
enum class KuitoPermission(
    /** What `request` asks the system for. Empty when there is nothing to ask. */
    val requested: List<String>,
    /** Granted when all of these are. */
    val granting: List<String> = requested,
    /** Limited when all of these are and [granting] is not. */
    val limiting: List<String> = emptyList(),
    /** A switch outside the runtime permission that must also be on. */
    val enabled: (Context) -> Boolean = { true },
    /** Granted before this one is asked for: Android won't ask for both at once. */
    val prerequisite: () -> KuitoPermission? = { null },
) {
    CAMERA(listOf(permission.CAMERA)),
    MICROPHONE(listOf(permission.RECORD_AUDIO)),
    // Android 14 lets the user pick photos instead of allowing all.
    PHOTOS(
        requested = when {
            sdk >= 34 -> listOf(permission.READ_MEDIA_IMAGES, permission.READ_MEDIA_VIDEO, permission.READ_MEDIA_VISUAL_USER_SELECTED)
            sdk >= 33 -> listOf(permission.READ_MEDIA_IMAGES, permission.READ_MEDIA_VIDEO)
            else -> listOf(permission.READ_EXTERNAL_STORAGE)
        },
        granting = if (sdk >= 33) listOf(permission.READ_MEDIA_IMAGES, permission.READ_MEDIA_VIDEO) else listOf(permission.READ_EXTERNAL_STORAGE),
        limiting = if (sdk >= 34) listOf(permission.READ_MEDIA_VISUAL_USER_SELECTED) else emptyList(),
    ),
    // Approximate location alone counts as granted, as in Expo.
    LOCATION(listOf(permission.ACCESS_FINE_LOCATION, permission.ACCESS_COARSE_LOCATION), granting = listOf(permission.ACCESS_COARSE_LOCATION)),
    // Android 10 split background access off; 11 asks for it only once foreground access is granted.
    LOCATION_ALWAYS(
        requested = if (sdk >= 29) listOf(permission.ACCESS_BACKGROUND_LOCATION) else LOCATION.requested,
        granting = if (sdk >= 29) listOf(permission.ACCESS_COARSE_LOCATION, permission.ACCESS_BACKGROUND_LOCATION) else LOCATION.granting,
        prerequisite = { if (sdk >= 29) LOCATION else null },
    ),
    // Before Android 13 notifications need no permission, only the app's switch in Settings.
    NOTIFICATIONS(
        requested = if (sdk >= 33) listOf(permission.POST_NOTIFICATIONS) else emptyList(),
        enabled = { it.getSystemService(NotificationManager::class.java).areNotificationsEnabled() },
    ),
}
