import UIKit

/// Runtime permissions for every module. A module that needs one (Camera,
/// Location, …) asks through here rather than calling the system API itself,
/// so status and `canAskAgain` mean the same thing everywhere:
///
///     KuitoPermissions.request(.camera) { response in
///         guard response.status == .granted else { return promise.reject("ERR_PERMISSION", "…") }
///         …
///     }
///
/// Completions run on the main thread.
@MainActor
enum KuitoPermissions {
    // One manager for every location request of a kind: its delegate settles them all.
    private static let location = KuitoLocationPermission(always: false)
    private static let locationAlways = KuitoLocationPermission(always: true)

    /// The table: one source per permission. A switch so a new name fails to
    /// compile until it has a source.
    private static func source(_ permission: KuitoPermission) -> KuitoPermissionSource {
        switch permission {
        case .camera: return KuitoCapturePermission(media: .video)
        case .microphone: return KuitoCapturePermission(media: .audio)
        case .photos: return KuitoPhotosPermission()
        case .location: return location
        case .locationAlways: return locationAlways
        case .notifications: return KuitoNotificationsPermission()
        }
    }

    static func check(_ permission: KuitoPermission, _ done: @escaping (KuitoPermissionResponse) -> Void) {
        source(permission).check(onMain(done))
    }

    static func request(_ permission: KuitoPermission, _ done: @escaping (KuitoPermissionResponse) -> Void) {
        source(permission).request(onMain(done))
    }

    private static func onMain(
        _ done: @escaping (KuitoPermissionResponse) -> Void
    ) -> (KuitoPermissionResponse) -> Void {
        { response in
            if Thread.isMainThread { done(response) } else { DispatchQueue.main.async { done(response) } }
        }
    }
}
