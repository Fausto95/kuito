package dev.kuito.runtime.modules.notifications

import dev.kuito.link.NotificationDelivery
import dev.kuito.link.NotificationRequest
import dev.kuito.link.NotificationsSpec
import dev.kuito.link.PushToken
import dev.kuito.runtime.link.KuitoEmitter
import dev.kuito.runtime.link.KuitoPromise
import dev.kuito.runtime.modules.KuitoModuleContext
import dev.kuito.runtime.modules.KuitoModuleError

/** `Notifications` in native/modules/notifications/notifications.ts. */
class KuitoNotificationsModule(private val context: KuitoModuleContext) : NotificationsSpec {
    private val app get() = context.applicationContext
    private var observation: (() -> Unit)? = null

    override fun schedule(request: NotificationRequest, promise: KuitoPromise<String>) {
        promise.resolve(KuitoNotifications.schedule(app, request.id, request.title, request.body, request.url, request.at))
    }

    override fun cancel(id: String) = KuitoNotifications.cancel(app, id)

    override fun cancelAll() = KuitoNotifications.cancelAll(app)

    // Android push needs a provider (FCM or another), which is not chosen yet.
    override fun register(promise: KuitoPromise<PushToken>) {
        throw KuitoModuleError(
            "ERR_UNSUPPORTED",
            "Notifications.register: remote push is not available on Android yet (docs/notifications.md#remote-push)",
        )
    }

    // Android posts only local notifications, so each is local.
    override fun startReceived(emitter: KuitoEmitter<NotificationDelivery>) {
        observation = KuitoNotifications.observe { shown ->
            emitter.send(NotificationDelivery(id = shown.id, title = shown.title, body = shown.body, url = shown.url, remote = false))
        }
    }

    override fun stopReceived() {
        observation?.invoke()
        observation = null
    }
}
