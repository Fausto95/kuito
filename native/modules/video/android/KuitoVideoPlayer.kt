package dev.kuito.runtime.modules.video

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import dev.kuito.runtime.modules.KuitoModuleError
import dev.kuito.runtime.modules.KuitoViewEvents
import dev.kuito.runtime.modules.audio.KuitoAudioSession
import java.io.File

/**
 * The ExoPlayer behind one Video view, and the events it reports
 * (docs/video.md). HLS plays through media3-exoplayer-hls, which
 * ExoPlayer's default media source factory finds by the `.m3u8` URI. It
 * plays in the app's [KuitoAudioSession], with Audio's players: one focus
 * request for all, rather than ExoPlayer's own, which would make each player
 * take focus from the others, and one background service. UI thread only.
 */
@UnstableApi
class KuitoVideoPlayer(context: Context, private val events: KuitoViewEvents, private val session: KuitoAudioSession) :
    KuitoAudioSession.Player {
    val exo: ExoPlayer = ExoPlayer.Builder(context).build()
    private val handler = Handler(Looper.getMainLooper())
    private val progress = Runnable { progressed() }
    private var loaded = false
    private var buffering = false
    private var released = false
    private var source: String? = null

    var muted = false
        set(next) {
            field = next
            applyVolume()
        }

    var volume = 1f
        set(next) {
            field = next
            applyVolume()
        }

    var rate = 1f
        set(next) {
            field = next
            exo.setPlaybackSpeed(next)
        }

    var loop = false
        set(next) {
            field = next
            exo.repeatMode = if (next) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
        }

    /** Milliseconds between progress events while playing; 0 sends none. */
    var progressInterval = PROGRESS_INTERVAL
        set(next) {
            field = next
            handler.removeCallbacks(progress)
            if (next > 0 && exo.isPlaying) handler.postDelayed(progress, next)
        }

    /** Wants to play, and hasn't reached the end. */
    override val playing get() = exo.playWhenReady && exo.playbackState != Player.STATE_ENDED

    init {
        session.add(this)
        exo.setAudioAttributes(ATTRIBUTES, false)
        exo.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                stateChanged(state)
                playingChanged()
            }

            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) = playingChanged()

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                // With where and how fast it plays, so JavaScript can run `time` from here (src/native/video.ts).
                events.emit(
                    "playbackStateChange",
                    mapOf(
                        "isPlaying" to isPlaying,
                        "currentTime" to exo.currentPosition / 1000.0,
                        "rate" to exo.playbackParameters.speed.toDouble(),
                    ),
                )
                handler.removeCallbacks(progress)
                if (isPlaying && progressInterval > 0) handler.postDelayed(progress, progressInterval)
            }

            // A looping item starts over without ending: each time round is an end.
            override fun onPositionDiscontinuity(old: Player.PositionInfo, new: Player.PositionInfo, reason: Int) {
                if (reason == Player.DISCONTINUITY_REASON_AUTO_TRANSITION) events.emit("end")
            }

            override fun onPlayerError(error: PlaybackException) {
                events.emit("error", mapOf("code" to "ERR_PLAYBACK", "message" to (error.message ?: error.errorCodeName)))
            }
        })
    }

    /** A new source, or none. A missing file fails at once, as `onError`. */
    fun load(uri: String?) {
        // The same source again (a re-render, a Live Patch) keeps playing where it is.
        if (uri != null && uri == source) return

        source = uri
        loaded = false
        exo.stop()
        exo.clearMediaItems()

        if (uri == null) return

        val parsed = Uri.parse(uri)

        if (parsed.scheme == "file" && !File(parsed.path.orEmpty()).exists())
            return events.emit("error", mapOf("code" to "ERR_NOT_FOUND", "message" to "Nothing at $uri"))

        exo.setMediaItem(MediaItem.fromUri(parsed))
        exo.prepare()
    }

    /** The app's own play or pause: whatever paused it in the background no longer matters. */
    fun setPaused(paused: Boolean) {
        session.forget(this)
        if (paused) pause() else play()
    }

    override fun play() {
        // Played to the end: start over, as a player's play button does.
        if (exo.playbackState == Player.STATE_ENDED) exo.seekTo(0)
        // After an error, try the source again.
        if (exo.playbackState == Player.STATE_IDLE && exo.mediaItemCount > 0) exo.prepare()

        // Under the app's audio mode, as Audio's players: mixing asks for no focus,
        // and another app keeping it (a call) keeps the video paused.
        if (!session.focus.request()) return

        exo.playWhenReady = true
        try {
            session.settle()
        } catch (refused: KuitoModuleError) {
            exo.playWhenReady = false
            events.emit("error", mapOf("code" to refused.code, "message" to refused.message))
        }
    }

    override fun pause() {
        exo.playWhenReady = false
    }

    /** Exact: ExoPlayer seeks to the frame, not the nearest key frame, by default. */
    fun seek(seconds: Double) {
        exo.seekTo((seconds * 1000).toLong())
    }

    fun release() {
        if (released) return

        released = true
        handler.removeCallbacks(progress)
        exo.release()
        session.remove(this)
    }

    /**
     * Paused, ended or failed: the session may give focus back and leave the
     * foreground. Starting is [play]'s to settle, where a refused service
     * becomes `onError` rather than a throw inside ExoPlayer's listener.
     */
    private fun playingChanged() {
        if (playing) return

        session.focus.idle()
        session.settle()
    }

    private fun applyVolume() {
        exo.volume = if (muted) 0f else volume
    }

    private fun stateChanged(state: Int) {
        val nowBuffering = state == Player.STATE_BUFFERING

        if (nowBuffering != buffering) {
            buffering = nowBuffering
            events.emit("buffer", mapOf("isBuffering" to nowBuffering))
        }

        when (state) {
            Player.STATE_READY -> if (!loaded) {
                loaded = true
                events.emit(
                    "load",
                    mapOf(
                        "duration" to exo.duration.takeIf { it != C.TIME_UNSET && !exo.isCurrentMediaItemLive }?.let { it / 1000.0 },
                        "currentTime" to exo.currentPosition / 1000.0,
                        "naturalSize" to mapOf("width" to exo.videoSize.width, "height" to exo.videoSize.height),
                    ),
                )
            }
            Player.STATE_ENDED -> events.emit("end")
            else -> {}
        }
    }

    private fun progressed() {
        if (!exo.isPlaying || progressInterval <= 0) return

        events.emit(
            "progress",
            mapOf("currentTime" to exo.currentPosition / 1000.0, "playableDuration" to exo.bufferedPosition / 1000.0),
        )
        handler.postDelayed(progress, progressInterval)
    }

    companion object {
        const val PROGRESS_INTERVAL = 250L

        private val ATTRIBUTES: AudioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build()
    }
}
