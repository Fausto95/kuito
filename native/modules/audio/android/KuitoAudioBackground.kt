package dev.kuito.runtime.modules.audio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.drawable.Icon
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import dev.kuito.runtime.modules.KuitoModuleError

/**
 * `staysActiveInBackground` on Android (docs/audio.md "The audio mode"):
 * while a player plays in that mode, an Audio player or a video,
 * [KuitoAudioService] holds the process in the foreground and shows a media
 * notification whose play and pause reach the players through a
 * [MediaSession]. [settle] is the one place that decides what is shown, from
 * the players and the players this class paused. UI thread only.
 */
class KuitoAudioBackground(
    private val context: Context,
    private val players: () -> Collection<KuitoAudioSession.Player>,
    private val keepsAlive: () -> Boolean,
) {
    private enum class Shown { NOTHING, PLAYING, WAITING, PAUSED }

    /** Why a player is paused here: the app is told, but resuming is someone else's call. */
    enum class Hold {
        /** Its notification's pause: its play resumes, so the notification stays, out of the foreground. */
        NOTIFICATION,

        /** A call, which the app may resume after: stays in the foreground, which it can't reenter from the background. */
        INTERRUPTION,
    }

    private val held = mutableMapOf<KuitoAudioSession.Player, Hold>()
    private var shown = Shown.NOTHING
    private val label = context.applicationInfo.loadLabel(context.packageManager).toString()

    private val session = MediaSession(context, "Kuito Audio").apply {
        setCallback(
            object : MediaSession.Callback() {
                override fun onPlay() = resume()

                override fun onPause() = hold(Hold.NOTIFICATION)
            },
            Handler(Looper.getMainLooper()),
        )
        setMetadata(MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, label).build())
    }

    // Android 13 and later draw the controls from the session; older ones show the notification's actions.
    private val actions = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == PLAY) resume() else hold(Hold.NOTIFICATION)
        }
    }

    init {
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, "Playback", NotificationManager.IMPORTANCE_LOW),
        )
        context.registerReceiver(
            actions,
            IntentFilter().apply {
                addAction(PLAY)
                addAction(PAUSE)
            },
            Context.RECEIVER_NOT_EXPORTED,
        )
    }

    /** Pauses the players that play, remembering why; before they pause, so [settle] sees the hold. */
    fun hold(why: Hold) {
        val playing = players().filter { it.playing }

        playing.forEach { held[it] = why }
        playing.forEach { it.pause() }
        settle()
    }

    /** The app paused or played it itself: whatever paused it here no longer matters. */
    fun forget(player: KuitoAudioSession.Player) {
        held.remove(player)
    }

    /**
     * After anything that may change what plays. Throws `ERR_AUDIO_MODE` when
     * a player starts in the background and Android won't start the service.
     */
    fun settle() {
        val all = players()

        held.keys.retainAll(all.toSet())
        if (!keepsAlive()) held.clear()

        val next = when {
            !keepsAlive() -> Shown.NOTHING
            all.any { it.playing } -> Shown.PLAYING
            Hold.INTERRUPTION in held.values -> Shown.WAITING
            Hold.NOTIFICATION in held.values -> Shown.PAUSED
            else -> Shown.NOTHING
        }

        if (next == Shown.PLAYING) held.clear()
        if (next == shown) return

        when (next) {
            Shown.PLAYING -> KuitoAudioService.foreground(context, notification(playing = true))
            Shown.WAITING -> KuitoAudioService.foreground(context, notification(playing = false))
            Shown.PAUSED -> KuitoAudioService.detach(context, notification(playing = false))
            Shown.NOTHING -> KuitoAudioService.stop(context)
        }
        shown = next
        session.setPlaybackState(state(next == Shown.PLAYING))
        session.isActive = next != Shown.NOTHING
    }

    fun release() {
        held.clear()
        if (shown != Shown.NOTHING) KuitoAudioService.stop(context)
        shown = Shown.NOTHING
        context.unregisterReceiver(actions)
        session.release()
    }

    private fun resume() {
        val paused = held.keys.toList()

        try {
            paused.forEach { it.play() }
            settle()
        } catch (refused: KuitoModuleError) {
            // Not expected: Android lets a media notification's controls start the service.
            // The players' statuses say they stopped again.
            paused.forEach { it.pause() }
        }
    }

    private fun state(playing: Boolean): PlaybackState = PlaybackState.Builder()
        .setActions(PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_PLAY_PAUSE)
        .setState(
            if (playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED,
            PlaybackState.PLAYBACK_POSITION_UNKNOWN,
            if (playing) 1f else 0f,
        )
        .build()

    private fun notification(playing: Boolean): Notification {
        val toggle = Notification.Action.Builder(
            Icon.createWithResource(context, if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play),
            if (playing) "Pause" else "Play",
            broadcast(if (playing) PAUSE else PLAY),
        ).build()

        return Notification.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(label)
            .setContentIntent(opensApp())
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(playing)
            .addAction(toggle)
            .setStyle(Notification.MediaStyle().setMediaSession(session.sessionToken).setShowActionsInCompactView(0))
            .build()
    }

    private fun broadcast(action: String) = PendingIntent.getBroadcast(
        context,
        action.hashCode(),
        Intent(action).setPackage(context.packageName),
        PendingIntent.FLAG_IMMUTABLE,
    )

    private fun opensApp() = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
        PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }

    private companion object {
        const val CHANNEL = "dev.kuito.audio"
        const val PLAY = "dev.kuito.audio.PLAY"
        const val PAUSE = "dev.kuito.audio.PAUSE"
    }
}
