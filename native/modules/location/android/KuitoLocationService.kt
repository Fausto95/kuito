package dev.kuito.runtime.modules.location

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.util.Log
import dev.kuito.runtime.modules.backgroundtasks.KuitoBackgroundTasks
import dev.kuito.runtime.modules.permissions.KuitoPermission
import dev.kuito.runtime.modules.permissions.KuitoPermissions

/**
 * The foreground service of type location that keeps the app locating for
 * its location tasks while it's in the background (docs/location.md). It
 * follows the tasks [KuitoLocationTasks] stores, and each fix becomes a run
 * of its task, in the UI's runtime or a headless one. Sticky: when Android
 * ends the process, it restarts the service, and the service its tasks.
 * Declared by the app's generated manifest (src/cli/app-settings.ts) only
 * when kuito.config.ts declares locationAlways.
 */
@SuppressLint("MissingPermission") // Updates start only once granted() says so.
class KuitoLocationService : Service() {
    private val manager by lazy { getSystemService(LocationManager::class.java) }
    private val listeners = mutableMapOf<String, KuitoLocationListener>()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
        KuitoBackgroundTasks.hold(SOURCE)
    }

    /** Every start, and every change to the stored tasks, brings the listeners in line with them. */
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val tasks = KuitoLocationTasks.started(this)

        if (tasks.isEmpty() || !KuitoPermissions.granted(this, KuitoPermission.LOCATION)) {
            if (tasks.isNotEmpty()) {
                Log.w("Kuito", "Location tasks stopped: location access is no longer granted")
                KuitoLocationTasks.forget(this)
            }
            stopSelf()

            return START_NOT_STICKY
        }

        try {
            foreground(tasks.values.first())
        } catch (error: RuntimeException) {
            // Android 12 and later refuse it from the background, Android 14 without the permission.
            Log.w("Kuito", "Location tasks could not start: ${error.message}")
            stopSelf()

            return START_NOT_STICKY
        }

        (listeners.keys - tasks.keys).forEach { listeners.remove(it)?.let(manager::removeUpdates) }
        tasks.values.filter { it.name !in listeners }.forEach(::listen)

        return START_STICKY
    }

    override fun onDestroy() {
        listeners.values.forEach(manager::removeUpdates)
        listeners.clear()
        running = false
        KuitoBackgroundTasks.release(SOURCE)
        super.onDestroy()
    }

    private fun listen(task: KuitoLocationTasks.Options) {
        val provider = task.accuracy.watching(manager).firstOrNull()

        if (provider == null) {
            Log.w("Kuito", "Location task '${task.name}' has no fixes: every location provider is off")

            return
        }

        val listener = KuitoLocationListener { location ->
            KuitoBackgroundTasks.deliver(task.name, mapOf("locations" to listOf(location.fix().kuitoEncoded())), BUDGET_MS)
        }

        manager.requestLocationUpdates(provider, task.timeInterval, task.distanceInterval, listener, Looper.getMainLooper())
        listeners[task.name] = listener
    }

    private fun foreground(task: KuitoLocationTasks.Options) {
        val notifications = getSystemService(NotificationManager::class.java)

        notifications.createNotificationChannel(
            NotificationChannel(CHANNEL, "Location", NotificationManager.IMPORTANCE_LOW),
        )

        val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
        }
        val notification = Notification.Builder(this, CHANNEL)
            .setSmallIcon(applicationInfo.icon)
            .setContentTitle(task.notificationTitle ?: applicationInfo.loadLabel(packageManager))
            .setContentText(task.notificationBody ?: "Using your location in the background")
            .setContentIntent(open)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        else startForeground(NOTIFICATION, notification)
    }

    companion object {
        /** Whether the service is up in this process. */
        var running = false
            private set

        private const val SOURCE = "location"
        private const val CHANNEL = "dev.kuito.location"
        private const val NOTIFICATION = 0x10ca
        /** A run per fix; one still running after this many milliseconds is cut off. */
        private const val BUDGET_MS = 25_000L
    }
}
