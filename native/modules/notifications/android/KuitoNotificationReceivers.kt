package dev.kuito.runtime.modules.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** A scheduled notification's alarm went off. */
class KuitoNotificationAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) = KuitoNotifications.fired(context, intent)
}

/** A reboot cleared the alarms; enabled only while a notification waits. */
class KuitoNotificationRestoreReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) KuitoNotifications.restore(context)
    }
}
