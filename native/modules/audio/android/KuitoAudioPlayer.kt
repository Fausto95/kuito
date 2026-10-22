package dev.kuito.runtime.modules.audio

import android.content.Context
import android.media.MediaPlayer
import android.net.Uri
import dev.kuito.link.AudioPlayerRequest
import dev.kuito.link.AudioPlayerStatus
import dev.kuito.runtime.modules.KuitoModuleError
import java.io.File
import java.io.FileNotFoundException

/**
 * One `AudioPlayer` (src/native/audio.ts): a MediaPlayer and the status it
 * reports when its state changes, in the app's [KuitoAudioSession] while it
 * exists. There is no clock here: JavaScript has the UI thread move `time`
 * from the last report, so playing sends nothing until something changes. UI
 * thread only; MediaPlayer calls its listeners on the looper that made it,
 * which is this one.
 */
class KuitoAudioPlayer(
    val id: Double,
    request: AudioPlayerRequest,
    context: Context,
    private val session: KuitoAudioSession,
    private val report: (AudioPlayerStatus) -> Unit,
) : KuitoAudioSession.Player {
    private val focus = session.focus
    private val player = MediaPlayer()
    private var volume = request.volume
    private var rate = request.rate
    private var loop = request.loop
    private var loaded = false
    private var buffering = false
    private var error: String? = null

    /** What the app asked for; MediaPlayer has no way to say it is waiting to play. */
    private var wantsToPlay = false

    init {
        player.setAudioAttributes(focus.attributes)
        player.setVolume(volume.toFloat(), volume.toFloat())
        source(context, request.uri)
        player.setOnPreparedListener {
            loaded = true
            if (wantsToPlay) start() else send()
        }
        player.setOnInfoListener { _, what, _ ->
            when (what) {
                MediaPlayer.MEDIA_INFO_BUFFERING_START -> buffering = true
                MediaPlayer.MEDIA_INFO_BUFFERING_END -> buffering = false
                else -> return@setOnInfoListener false
            }
            send()
            true
        }
        // Looping here, not with MediaPlayer.isLooping, which starts over
        // without completing: each time round reports ended, as on iOS.
        player.setOnCompletionListener {
            if (loop) {
                player.seekTo(0)
                player.start()
            } else {
                wantsToPlay = false
                focus.idle()
            }
            send(ended = true)
        }
        player.setOnErrorListener { _, what, extra ->
            error = "MediaPlayer error $what ($extra)"
            loaded = false
            wantsToPlay = false
            send()
            true
        }
        player.prepareAsync()
        session.add(this)
    }

    override val playing get() = wantsToPlay

    override fun play() {
        wantsToPlay = true
        if (loaded) start() else send()
    }

    override fun pause() {
        wantsToPlay = false
        if (loaded && player.isPlaying) player.pause()
        focus.idle()
        send()
    }

    fun seekTo(seconds: Double) {
        if (!loaded) throw KuitoModuleError("ERR_NOT_LOADED", "AudioPlayer.seekTo: the source hasn't loaded yet")

        player.setOnSeekCompleteListener { send() }
        player.seekTo((seconds * 1000).toLong(), MediaPlayer.SEEK_CLOSEST)
    }

    fun setVolume(next: Double) {
        volume = next
        player.setVolume(next.toFloat(), next.toFloat())
        send()
    }

    fun setRate(next: Double) {
        rate = next
        // Setting a speed starts a paused MediaPlayer, so it waits for play().
        if (loaded && player.isPlaying) player.playbackParams = player.playbackParams.setSpeed(next.toFloat())
        send()
    }

    fun setLoop(next: Boolean) {
        loop = next
        send()
    }

    fun release() {
        wantsToPlay = false
        player.release()
        session.remove(this)
    }

    private fun start() {
        if (!focus.request()) {
            wantsToPlay = false
            return send()
        }

        player.playbackParams = player.playbackParams.setSpeed(rate.toFloat())
        player.start()
        send()
    }

    private fun source(context: Context, uri: String) {
        val parsed = Uri.parse(uri)

        try {
            when (parsed.scheme) {
                "asset" -> context.assets.openFd(parsed.path.orEmpty().trimStart('/')).use {
                    player.setDataSource(it.fileDescriptor, it.startOffset, it.length)
                }
                "file" -> {
                    val file = File(parsed.path.orEmpty())

                    if (!file.isFile) throw KuitoModuleError("ERR_NOT_FOUND", "Nothing at $uri")
                    player.setDataSource(file.path)
                }
                else -> player.setDataSource(context, parsed)
            }
        } catch (missing: FileNotFoundException) {
            player.release()
            throw KuitoModuleError("ERR_NOT_FOUND", "$uri is not in the app's assets, or is compressed")
        } catch (failure: KuitoModuleError) {
            player.release()
            throw failure
        }
    }

    private fun send(ended: Boolean = false) {
        val duration = if (loaded) player.duration else -1

        report(
            AudioPlayerStatus(
                id = id,
                isLoaded = loaded,
                playing = wantsToPlay,
                isBuffering = wantsToPlay && (!loaded || buffering),
                currentTime = if (loaded) player.currentPosition / 1000.0 else 0.0,
                duration = if (duration < 0) -1.0 else duration / 1000.0,
                ended = ended,
                volume = volume,
                rate = rate,
                loop = loop,
                error = error,
            ),
        )
    }
}
