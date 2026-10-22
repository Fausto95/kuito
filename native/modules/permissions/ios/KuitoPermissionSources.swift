import AVFoundation
import Photos
import UserNotifications

/// Camera (`.video`) and microphone (`.audio`).
struct KuitoCapturePermission: KuitoPermissionSource {
    let media: AVMediaType

    func check(_ done: @escaping (KuitoPermissionResponse) -> Void) {
        done(KuitoPermissionResponse(Self.status(AVCaptureDevice.authorizationStatus(for: media))))
    }

    func request(_ done: @escaping (KuitoPermissionResponse) -> Void) {
        let media = media

        AVCaptureDevice.requestAccess(for: media) { _ in
            done(KuitoPermissionResponse(Self.status(AVCaptureDevice.authorizationStatus(for: media))))
        }
    }

    private static func status(_ status: AVAuthorizationStatus) -> KuitoPermissionStatus {
        switch status {
        case .authorized: return .granted
        case .notDetermined: return .undetermined
        case .denied, .restricted: return .denied
        @unknown default: return .denied
        }
    }
}

/// The photo library, read and write. A selection of photos is `limited`.
struct KuitoPhotosPermission: KuitoPermissionSource {
    func check(_ done: @escaping (KuitoPermissionResponse) -> Void) {
        done(KuitoPermissionResponse(Self.status(PHPhotoLibrary.authorizationStatus(for: .readWrite))))
    }

    func request(_ done: @escaping (KuitoPermissionResponse) -> Void) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
            done(KuitoPermissionResponse(Self.status(status)))
        }
    }

    private static func status(_ status: PHAuthorizationStatus) -> KuitoPermissionStatus {
        switch status {
        case .authorized: return .granted
        case .limited: return .limited
        case .notDetermined: return .undetermined
        case .denied, .restricted: return .denied
        @unknown default: return .denied
        }
    }
}

/// Alerts, badges and sounds. Provisional and ephemeral delivery count as
/// granted, as in Expo: the app may post.
struct KuitoNotificationsPermission: KuitoPermissionSource {
    func check(_ done: @escaping (KuitoPermissionResponse) -> Void) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            done(KuitoPermissionResponse(Self.status(settings.authorizationStatus)))
        }
    }

    func request(_ done: @escaping (KuitoPermissionResponse) -> Void) {
        // The prompt's error only says it could not be shown; the status that
        // follows is the answer either way.
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in
            UNUserNotificationCenter.current().getNotificationSettings { settings in
                done(KuitoPermissionResponse(Self.status(settings.authorizationStatus)))
            }
        }
    }

    private static func status(_ status: UNAuthorizationStatus) -> KuitoPermissionStatus {
        switch status {
        case .authorized, .provisional, .ephemeral: return .granted
        case .notDetermined: return .undetermined
        case .denied: return .denied
        @unknown default: return .denied
        }
    }
}
