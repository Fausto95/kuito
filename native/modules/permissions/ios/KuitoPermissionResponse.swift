/// `PermissionStatus` in native/modules/permissions/permissions.ts.
enum KuitoPermissionStatus: String {
    case granted, denied, undetermined, limited
}

/// `PermissionResponse` in native/modules/permissions/permissions.ts.
struct KuitoPermissionResponse {
    let status: KuitoPermissionStatus
    let canAskAgain: Bool

    /// iOS prompts once per permission: after a denial only Settings can grant it.
    init(_ status: KuitoPermissionStatus) {
        self.status = status
        canAskAgain = status != .denied
    }
}

/// Where one permission's status comes from, and how it is asked for. Both
/// call `done` exactly once, from any thread.
@MainActor
protocol KuitoPermissionSource {
    func check(_ done: @escaping (KuitoPermissionResponse) -> Void)
    /// Prompts when the status is undetermined; otherwise answers the current status.
    func request(_ done: @escaping (KuitoPermissionResponse) -> Void)
}
