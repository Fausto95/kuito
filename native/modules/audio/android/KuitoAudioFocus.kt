package dev.kuito.runtime.modules.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import dev.kuito.link.AudioMode

/**
 * `audio.configure` on Android: audio focus, held while a player plays.
 * Losing it to a call or another app is an interruption: [interrupted]
 * pauses the players and tells the app; a transient one, such as a call,
 * ends when focus comes back. UI thread only.
 */
class KuitoAudioFocus(
    context: Context,
    private val playing: () -> Boolean,
    private val interrupted: (began: Boolean, shouldResume: Boolean, transient: Boolean) -> Unit,
) {
    /** `AudioMode` in native/modules/audio/audio.ts. `playsInSilentMode` and `allowsRecording` are iOS-only. */
    data class Mode(val mixWithOthers: Boolean, val duckOthers: Boolean, val staysActiveInBackground: Boolean) {
        companion object {
            val initial = Mode(mixWithOthers = false, duckOthers = false, staysActiveInBackground = false)

            fun from(mode: AudioMode) = Mode(
                mixWithOthers = mode.mixWithOthers,
                duckOthers = mode.duckOthers,
                staysActiveInBackground = mode.staysActiveInBackground,
            )
        }
    }

    val attributes: AudioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
        .build()

    /** The app's mode, one for every player in the process. */
    var mode: Mode
        get() = appMode
        set(next) {
            if (next != appMode) abandon()
            appMode = next
        }

    private val audio = context.getSystemService(AudioManager::class.java)
    private var held: AudioFocusRequest? = null

    /** Lost for a while (a call): kept requested, so focus coming back is heard. */
    private var suspended = false

    /** Before a player starts. False when another app keeps focus, as during a call. */
    fun request(): Boolean {
        if (mode.mixWithOthers || held != null) return true

        // The system ducks this app itself when another asks to duck it.
        val request = AudioFocusRequest.Builder(
            if (mode.duckOthers) AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK else AudioManager.AUDIOFOCUS_GAIN,
        )
            .setAudioAttributes(attributes)
            .setWillPauseWhenDucked(false)
            .setOnAudioFocusChangeListener(::changed, Handler(Looper.getMainLooper()))
            .build()

        if (audio.requestAudioFocus(request) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) return false

        held = request
        suspended = false

        return true
    }

    /** After a player stops: gives focus back once none plays, unless waiting for it to return. */
    fun idle() {
        if (!suspended && !playing()) abandon()
    }

    fun abandon() {
        held?.let(audio::abandonAudioFocusRequest)
        held = null
        suspended = false
    }

    private fun changed(change: Int) {
        when (change) {
            AudioManager.AUDIOFOCUS_LOSS -> {
                abandon()
                interrupted(true, false, false)
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                suspended = true
                interrupted(true, false, true)
            }
            AudioManager.AUDIOFOCUS_GAIN -> if (suspended) {
                suspended = false
                interrupted(false, true, true)
                idle()
            }
        }
    }

    companion object {
        /**
         * What `audio.configure` set last. Video's players follow it too
         * (docs/video.md); a reload sets it back to [Mode.initial].
         */
        @Volatile
        var appMode = Mode.initial
            internal set
    }
}
