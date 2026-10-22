package dev.kuito.runtime.modules.permissions

import dev.kuito.link.PermissionName
import dev.kuito.link.PermissionResponse
import dev.kuito.link.PermissionStatus
import dev.kuito.link.PermissionsSpec
import dev.kuito.runtime.link.KuitoPromise
import dev.kuito.runtime.modules.KuitoModuleContext

/** `Permissions` in native/modules/permissions/permissions.ts. Other modules use [KuitoPermissions] directly. */
class KuitoPermissionsModule(private val context: KuitoModuleContext) : PermissionsSpec {
    override fun check(name: PermissionName, promise: KuitoPromise<PermissionResponse>) {
        promise.resolve(linked(KuitoPermissions.check(context.activity, permission(name))))
    }

    override fun request(name: PermissionName, promise: KuitoPromise<PermissionResponse>) {
        KuitoPermissions.request(context.activity, permission(name)) { promise.resolve(linked(it)) }
    }

    private fun permission(name: PermissionName) = when (name) {
        PermissionName.CAMERA -> KuitoPermission.CAMERA
        PermissionName.MICROPHONE -> KuitoPermission.MICROPHONE
        PermissionName.PHOTOS -> KuitoPermission.PHOTOS
        PermissionName.LOCATION -> KuitoPermission.LOCATION
        PermissionName.LOCATION_ALWAYS -> KuitoPermission.LOCATION_ALWAYS
        PermissionName.NOTIFICATIONS -> KuitoPermission.NOTIFICATIONS
    }

    private fun linked(response: KuitoPermissionResponse) = PermissionResponse(
        status = when (response.status) {
            KuitoPermissionStatus.GRANTED -> PermissionStatus.GRANTED
            KuitoPermissionStatus.DENIED -> PermissionStatus.DENIED
            KuitoPermissionStatus.UNDETERMINED -> PermissionStatus.UNDETERMINED
            KuitoPermissionStatus.LIMITED -> PermissionStatus.LIMITED
        },
        canAskAgain = response.canAskAgain,
    )
}
