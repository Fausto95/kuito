/// A permission a module asks for: `PermissionName` in
/// native/modules/permissions/permissions.ts. Where each one's status comes
/// from is the table in KuitoPermissions.swift.
enum KuitoPermission: String, CaseIterable {
    case camera
    case microphone
    case photos
    case location
    case locationAlways
    case notifications
}
