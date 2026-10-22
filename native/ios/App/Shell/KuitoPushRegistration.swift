import Foundation

/// The app delegate's answer to a push registration, for the module that
/// asked (Notifications, which sets `answered` at launch). A shell without
/// it registers for none, so no answer arrives.
final class KuitoPushRegistration {
    static let shared = KuitoPushRegistration()

    /// The device token, or why iOS refused. Main thread.
    var answered: (Result<Data, Error>) -> Void = { _ in }

    func answer(_ result: Result<Data, Error>) {
        answered(result)
    }
}
