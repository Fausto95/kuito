import Foundation

/// `Notifications` in native/modules/notifications/notifications.ts.
final class KuitoNotificationsModule: NotificationsSpec {
    private var observation: UUID?

    init(context: KuitoModuleContext) {}

    @MainActor static func launch() {
        KuitoNotifications.shared.launched()
    }

    @MainActor func schedule(_ request: NotificationRequest, _ promise: KuitoPromise<String>) {
        KuitoNotifications.shared.schedule(
            id: request.id, title: request.title, body: request.body, url: request.url, at: request.at
        ) { result in
            switch result {
            case .success(let id): promise.resolve(id)
            case .failure(let error): promise.reject(error)
            }
        }
    }

    @MainActor func cancel(_ id: String) throws {
        KuitoNotifications.shared.cancel(id)
    }

    @MainActor func cancelAll() throws {
        KuitoNotifications.shared.cancelAll()
    }

    @MainActor func register(_ promise: KuitoPromise<PushToken>) {
        KuitoNotifications.shared.register { result in
            switch result {
            case .success(let token): promise.resolve(PushToken(service: .apns, token: token))
            case .failure(let error): promise.reject("ERR_PUSH", "Notifications.register: iOS gave no push token: \(error.localizedDescription)")
            }
        }
    }

    @MainActor func startReceived(_ emitter: KuitoEmitter<NotificationDelivery>) {
        observation = KuitoNotifications.shared.observe { emitter.send($0) }
    }

    @MainActor func stopReceived() {
        observation.map(KuitoNotifications.shared.cancel(observing:))
        observation = nil
    }
}
