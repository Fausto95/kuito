package dev.kuito.runtime.modules.notifications

import android.app.ActivityManager
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import dev.kuito.runtime.R
import dev.kuito.runtime.modules.KuitoModuleError
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList

/**
 * The app's notifications. A scheduled one waits as an alarm, kept in
 * preferences so [restore] can set it again after a reboot clears alarms.
 * A tap opens the notification's url as an `ACTION_VIEW` intent to the
 * app's own activity, which reports it to KuitoLinks as any link that
 * opens the app. UI thread, and the receivers' main thread.
 */
object KuitoNotifications {
    /** One channel for every notification; its importance makes them heads-up, as iOS banners are. */
    private const val CHANNEL = "dev.kuito.notifications"
    private const val STORE = "dev.kuito.notifications"
    private const val SCHEME = "kuito-notification"

    class Scheduled(val title: String, val body: String?, val url: String?, val at: Double)

    /** What the app hears when a notification shows while it is in the foreground: id, title, body, url. */
    class Shown(val id: String, val title: String, val body: String?, val url: String?)

    private val observers = CopyOnWriteArrayList<(Shown) -> Unit>()

    /** Calls [observer] with each notification shown while the app is in the foreground, until the returned function is called. */
    fun observe(observer: (Shown) -> Unit): () -> Unit {
        observers.add(observer)

        return { observers.remove(observer) }
    }

    /**
     * Shows a notification at [at] (milliseconds since the epoch), or now when it is null or past,
     * in place of any with the same id. Returns its id.
     */
    fun schedule(context: Context, id: String?, title: String, body: String?, url: String?, at: Double?): String {
        if (!notifications(context).areNotificationsEnabled()) {
            throw KuitoModuleError("ERR_PERMISSION", "Notifications.schedule: the app may not show notifications; ask with permissions.request('notifications')")
        }

        val key = id ?: UUID.randomUUID().toString()

        cancelAlarm(context, key)
        notifications(context).cancel(key, 0)

        if (at == null || at <= System.currentTimeMillis()) {
            forget(context, key)
            show(context, key, title, body, url)
        } else {
            store(context).edit().putString(key, encode(Scheduled(title, body, url, at))).apply()
            setAlarm(context, key, at)
            restoring(context)
        }

        return key
    }

    fun cancel(context: Context, id: String) {
        cancelAlarm(context, id)
        forget(context, id)
        notifications(context).cancel(id, 0)
    }

    fun cancelAll(context: Context) {
        store(context).all.keys.forEach { cancelAlarm(context, it) }
        store(context).edit().clear().apply()
        restoring(context)
        notifications(context).cancelAll()
    }

    /** An alarm went off: shows its notification. */
    fun fired(context: Context, intent: Intent) {
        val id = intent.data?.takeIf { it.scheme == SCHEME }?.schemeSpecificPart ?: return
        val scheduled = store(context).getString(id, null)?.let(::decode) ?: return

        forget(context, id)
        show(context, id, scheduled.title, scheduled.body, scheduled.url)
    }

    /** The device booted: sets each alarm again, and shows the ones whose time passed without their alarm. */
    fun restore(context: Context) {
        store(context).all.forEach { (id, value) ->
            val scheduled = (value as? String)?.let(::decode) ?: return@forEach

            if (scheduled.at <= System.currentTimeMillis()) {
                forget(context, id)
                show(context, id, scheduled.title, scheduled.body, scheduled.url)
            } else {
                setAlarm(context, id, scheduled.at)
            }
        }
    }

    private fun show(context: Context, id: String, title: String, body: String?, url: String?) {
        val manager = notifications(context)

        manager.createNotificationChannel(
            NotificationChannel(CHANNEL, "Notifications", NotificationManager.IMPORTANCE_HIGH),
        )
        manager.notify(
            id,
            0,
            Notification.Builder(context, CHANNEL)
                .setSmallIcon(smallIcon(context))
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setContentIntent(tap(context, id, url))
                .build(),
        )

        if (inForeground()) observers.forEach { it(Shown(id, title, body, url)) }
    }

    private fun inForeground() = ActivityManager.RunningAppProcessInfo()
        .also(ActivityManager::getMyMemoryState)
        .importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND

    /** Opens the app's own activity, with the url as the link that opened it. */
    private fun tap(context: Context, id: String, url: String?): PendingIntent? {
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
        val intent = if (url == null) launch else Intent(Intent.ACTION_VIEW, Uri.parse(url)).setComponent(launch.component)

        return PendingIntent.getActivity(
            context,
            id.hashCode(),
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    // The status bar draws the icon as a silhouette: the app's monochrome icon when it has one. Never
    // the launcher icon, which is adaptive: Android 8.0's status bar fails on an adaptive small icon.
    private fun smallIcon(context: Context): Int =
        context.resources.getIdentifier("ic_launcher_monochrome", "mipmap", context.packageName)
            .takeIf { it != 0 } ?: R.drawable.kuito_notification_icon

    private fun setAlarm(context: Context, id: String, at: Double) {
        val alarms = context.getSystemService(AlarmManager::class.java)
        val operation = alarm(context, id, PendingIntent.FLAG_UPDATE_CURRENT) ?: return

        // SCHEDULE_EXACT_ALARM is granted at install on Android 12 and 13, and on 14 only once the user
        // allows alarms and reminders. Without it the alarm is inexact: Android may deliver it late by
        // a large part of the wait.
        if (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()) {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.toLong(), operation)
        } else {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.toLong(), operation)
        }
    }

    private fun cancelAlarm(context: Context, id: String) {
        alarm(context, id, PendingIntent.FLAG_NO_CREATE)?.let { operation ->
            context.getSystemService(AlarmManager::class.java).cancel(operation)
            operation.cancel()
        }
    }

    // One alarm per id: the id is the intent's data, which tells the pending intents apart.
    private fun alarm(context: Context, id: String, flags: Int): PendingIntent? = PendingIntent.getBroadcast(
        context,
        0,
        Intent(context, KuitoNotificationAlarmReceiver::class.java).setData(Uri.fromParts(SCHEME, id, null)),
        PendingIntent.FLAG_IMMUTABLE or flags,
    )

    private fun forget(context: Context, id: String) {
        store(context).edit().remove(id).apply()
        restoring(context)
    }

    /** The boot receiver is on only while something waits, so a reboot doesn't start an app with nothing to restore. */
    private fun restoring(context: Context) {
        val state = if (store(context).all.isEmpty()) {
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        } else {
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        }

        context.packageManager.setComponentEnabledSetting(
            ComponentName(context, KuitoNotificationRestoreReceiver::class.java),
            state,
            PackageManager.DONT_KILL_APP,
        )
    }

    private fun store(context: Context) = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)

    private fun notifications(context: Context) = context.getSystemService(NotificationManager::class.java)

    private fun encode(scheduled: Scheduled) = JSONObject()
        .put("title", scheduled.title)
        .put("body", scheduled.body)
        .put("url", scheduled.url)
        .put("at", scheduled.at)
        .toString()

    private fun decode(text: String): Scheduled {
        val json = JSONObject(text)

        return Scheduled(
            title = json.getString("title"),
            body = json.optString("body").takeIf { json.has("body") },
            url = json.optString("url").takeIf { json.has("url") },
            at = json.getDouble("at"),
        )
    }
}
