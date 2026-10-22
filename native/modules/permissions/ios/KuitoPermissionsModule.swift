/// `Permissions` in native/modules/permissions/permissions.ts. Other modules
/// use `KuitoPermissions` directly.
final class KuitoPermissionsModule: PermissionsSpec {
    init(context: KuitoModuleContext) {}

    @MainActor func check(_ name: PermissionName, _ promise: KuitoPromise<PermissionResponse>) {
        KuitoPermissions.check(KuitoPermission(name)) { promise.resolve(PermissionResponse($0)) }
    }

    @MainActor func request(_ name: PermissionName, _ promise: KuitoPromise<PermissionResponse>) {
        KuitoPermissions.request(KuitoPermission(name)) { promise.resolve(PermissionResponse($0)) }
    }
}

private extension KuitoPermission {
    init(_ name: PermissionName) {
        switch name {
        case .camera: self = .camera
        case .microphone: self = .microphone
        case .photos: self = .photos
        case .location: self = .location
        case .locationAlways: self = .locationAlways
        case .notifications: self = .notifications
        }
    }
}

private extension PermissionResponse {
    init(_ response: KuitoPermissionResponse) {
        self.init(status: PermissionStatus(response.status), canAskAgain: response.canAskAgain)
    }
}

private extension PermissionStatus {
    init(_ status: KuitoPermissionStatus) {
        switch status {
        case .granted: self = .granted
        case .denied: self = .denied
        case .undetermined: self = .undetermined
        case .limited: self = .limited
        }
    }
}
