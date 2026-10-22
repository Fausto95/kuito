package dev.kuito.runtime.modules.audio

import android.app.Notification
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import dev.kuito.runtime.modules.KuitoModuleError

/**
 * The media playback foreground service `staysActiveInBackground` runs on
 * Android: while it is in the foreground the system keeps the process, and
 * with it Audio's players and the videos, alive. It only shows the notification it is handed;
 * [KuitoAudioBackground] decides which, and when.
 */
class KuitoAudioService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = intent?.let(::notificationOf)

        if (notification == null) {
            stopSelf()
            return START_NOT_STICKY
        }

        if (intent.action == DETACH) {
            // Out of the foreground, the notification stays and can be swiped away.
            stopForeground(STOP_FOREGROUND_DETACH)
            getSystemService(NotificationManager::class.java).notify(NOTIFICATION, notification)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            startForeground(NOTIFICATION, notification)
        }

        // A process the system kills has no players to bring back.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        getSystemService(NotificationManager::class.java).cancel(NOTIFICATION)
    }

    companion object {
        private const val NOTIFICATION = 0x766563
        private const val EXTRA = "notification"
        private const val FOREGROUND = "dev.kuito.audio.FOREGROUND"
        private const val DETACH = "dev.kuito.audio.DETACH"

        /** Throws `ERR_AUDIO_MODE` when Android 12+ refuses, as it does to an app in the background. */
        fun foreground(context: Context, notification: Notification) {
            try {
                context.startForegroundService(intent(context, FOREGROUND, notification))
            } catch (refused: IllegalStateException) {
                // ForegroundServiceStartNotAllowedException, which Android 11 and older can't load.
                throw KuitoModuleError(
                    "ERR_AUDIO_MODE",
                    "Android starts background playback only while the app is in the foreground or from its media notification; play before leaving the app",
                )
            }
        }

        /** Only from the foreground: an app with a foreground service may start its services. */
        fun detach(context: Context, notification: Notification) {
            context.startService(intent(context, DETACH, notification))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, KuitoAudioService::class.java))
        }

        private fun intent(context: Context, action: String, notification: Notification) =
            Intent(context, KuitoAudioService::class.java).setAction(action).putExtra(EXTRA, notification)

        private fun notificationOf(intent: Intent): Notification? =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(EXTRA, Notification::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(EXTRA)
            }
    }
}
