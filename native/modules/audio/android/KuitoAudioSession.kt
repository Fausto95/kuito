package dev.kuito.runtime.modules.audio

import android.content.Context

/**
 * The app's audio session on Android, the counterpart of iOS's
 * AVAudioSession: everything that plays under the audio mode, Audio's
 * players and Video's, shares one [focus] and one [KuitoAudioBackground].
 * So a video counts as playing for the background service, and a video and
 * an Audio player don't take focus from each other. It outlives runtimes;
 * players join while they exist. UI thread only.
 */
class KuitoAudioSession private constructor(private val context: Context) {
    /** What the session pauses for an interruption or the notification, and plays again from it. */
    interface Player {
        val playing: Boolean

        fun play()

        fun pause()
    }

    private val players = mutableSetOf<Player>()
    private val interruptions = mutableSetOf<(began: Boolean, shouldResume: Boolean) -> Unit>()
    private var created: KuitoAudioBackground? = null
    private val background: KuitoAudioBackground
        get() = created ?: KuitoAudioBackground(context, players = { players }, keepsAlive = { focus.mode.staysActiveInBackground })
            .also { created = it }

    val focus = KuitoAudioFocus(context, playing = { players.any { it.playing } }) { began, shouldResume, transient ->
        // In the background, only the notification can start playback again after a lasting loss.
        if (began) background.hold(if (transient) KuitoAudioBackground.Hold.INTERRUPTION else KuitoAudioBackground.Hold.NOTIFICATION)
        interruptions.toList().forEach { it(began, shouldResume) }
    }

    fun add(player: Player) {
        players.add(player)
    }

    /** Released: the last one out lets go of focus, the service and the media session. */
    fun remove(player: Player) {
        players.remove(player)
        if (players.isNotEmpty()) {
            settle()
            return focus.idle()
        }

        created?.release()
        created = null
        focus.abandon()
    }

    /** The app paused or played [player] itself: whatever paused it here no longer matters. */
    fun forget(player: Player) {
        created?.forget(player)
    }

    /**
     * After anything that may change what plays. Throws `ERR_AUDIO_MODE` when
     * a player starts in the background and Android won't start the service.
     */
    fun settle() {
        if (players.isNotEmpty()) background.settle()
    }

    /** Calls [observer] as interruptions begin and end, until the returned function is called. */
    fun observeInterruptions(observer: (began: Boolean, shouldResume: Boolean) -> Unit): () -> Unit {
        interruptions.add(observer)

        return { interruptions.remove(observer) }
    }

    companion object {
        private var shared: KuitoAudioSession? = null

        fun of(context: Context): KuitoAudioSession =
            shared ?: KuitoAudioSession(context.applicationContext).also { shared = it }
    }
}
