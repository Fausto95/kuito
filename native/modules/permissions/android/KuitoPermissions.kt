package dev.kuito.runtime.modules.permissions

import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.result.contract.ActivityResultContracts
import dev.kuito.runtime.modules.KuitoActivityResults
import dev.kuito.runtime.modules.permissions.KuitoPermissionStatus.DENIED
import dev.kuito.runtime.modules.permissions.KuitoPermissionStatus.GRANTED
import dev.kuito.runtime.modules.permissions.KuitoPermissionStatus.LIMITED
import dev.kuito.runtime.modules.permissions.KuitoPermissionStatus.UNDETERMINED

/**
 * Runtime permissions for every module. A module that needs one (Camera,
 * Location, …) asks through here rather than calling the system API itself,
 * so status and `canAskAgain` mean the same thing everywhere:
 *
 *     KuitoPermissions.request(context.activity, KuitoPermission.CAMERA) { response -> … }
 *
 * Call on the main thread; completions run there too.
 */
object KuitoPermissions {
    /** Whether the app has [permission], from any context: a background task's runtime has no activity. */
    fun granted(context: Context, permission: KuitoPermission) =
        permission.granting.all { context.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED } && permission.enabled(context)

    fun check(activity: Activity, permission: KuitoPermission): KuitoPermissionResponse {
        val has = { name: String -> activity.checkSelfPermission(name) == PackageManager.PERMISSION_GRANTED }

        return when {
            granted(activity, permission) -> KuitoPermissionResponse(GRANTED, true)
            permission.limiting.isNotEmpty() && permission.limiting.all(has) -> KuitoPermissionResponse(LIMITED, true)
            permission.requested.isEmpty() -> KuitoPermissionResponse(DENIED, false)
            permission.requested.any(activity::shouldShowRequestPermissionRationale) -> KuitoPermissionResponse(DENIED, true)
            // Android answers the same before the first prompt and after "don't
            // ask again"; only having asked tells them apart.
            asked(activity, permission) -> KuitoPermissionResponse(DENIED, false)
            else -> KuitoPermissionResponse(UNDETERMINED, true)
        }
    }

    /**
     * Prompts when the system will; otherwise answers the current status. A
     * permission with a prerequisite asks for that first, and for itself only
     * once the prerequisite is granted.
     */
    fun request(activity: Activity, permission: KuitoPermission, done: (KuitoPermissionResponse) -> Unit) {
        val prerequisite = permission.prerequisite()

        if (prerequisite != null && check(activity, prerequisite).status != GRANTED)
            return request(activity, prerequisite) {
                if (it.status == GRANTED) request(activity, permission, done) else done(check(activity, permission))
            }

        val current = check(activity, permission)

        if (current.status == GRANTED || !current.canAskAgain) return done(current)

        KuitoActivityResults.launch(
            activity, ActivityResultContracts.RequestMultiplePermissions(), permission.requested.toTypedArray(),
        ) {
            markAsked(activity, permission)
            done(check(activity, permission))
        }
    }

    private fun asked(context: Context, permission: KuitoPermission) =
        preferences(context).getBoolean(permission.name, false)

    private fun markAsked(context: Context, permission: KuitoPermission) =
        preferences(context).edit().putBoolean(permission.name, true).apply()

    private fun preferences(context: Context) =
        context.getSharedPreferences("dev.kuito.permissions", Context.MODE_PRIVATE)
}
