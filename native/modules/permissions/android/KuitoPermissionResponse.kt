package dev.kuito.runtime.modules.permissions

/** `PermissionStatus` in native/modules/permissions/permissions.ts. */
enum class KuitoPermissionStatus(val wire: String) {
    GRANTED("granted"),
    DENIED("denied"),
    UNDETERMINED("undetermined"),
    LIMITED("limited"),
}

/** `PermissionResponse` in native/modules/permissions/permissions.ts. */
data class KuitoPermissionResponse(val status: KuitoPermissionStatus, val canAskAgain: Boolean)
