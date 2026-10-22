package dev.kuito.runtime.modules.audio

import android.Manifest
import android.content.pm.PackageManager
import dev.kuito.link.AudioInterruption
import dev.kuito.link.AudioInterruptionType
import dev.kuito.link.AudioMode
import dev.kuito.link.AudioPlayerRequest
import dev.kuito.link.AudioPlayerStatus
import dev.kuito.link.AudioRecorderRequest
import dev.kuito.link.AudioRecorderStatus
import dev.kuito.link.AudioSpec
import dev.kuito.runtime.link.KuitoEmitter
import dev.kuito.runtime.link.KuitoPromise
import dev.kuito.runtime.link.resolve
import dev.kuito.runtime.modules.KuitoModuleContext
import dev.kuito.runtime.modules.KuitoModuleError
import dev.kuito.runtime.shell.KuitoAppLifecycle
import dev.kuito.runtime.modules.permissions.KuitoPermission
import dev.kuito.runtime.modules.permissions.KuitoPermissionStatus
import dev.kuito.runtime.modules.permissions.KuitoPermissions

/**
 * `Audio` in native/modules/audio/audio.ts. Players and recorders are native
 * objects keyed by the id JavaScript gives them; every function but `nextId`
 * runs on the UI thread, so the tables need no lock. A reload releases them all.
 */
class KuitoAudioModule(private val context: KuitoModuleContext) : AudioSpec {
    private val app get() = context.applicationContext
    private val players = mutableMapOf<Double, KuitoAudioPlayer>()
    private val recorders = mutableMapOf<Double, KuitoAudioRecorder>()
    private val session by lazy { KuitoAudioSession.of(app) }

    /** Stops observing the app's lifecycle and interruptions. */
    private var observing: (() -> Unit)? = null

    /** Touched only by `nextId`, on the JS thread. */
    private var ids = 0.0

    // Set while JavaScript listens: src/native/audio.ts listens while any
    // player or recorder lives, from before it makes the first.
    private var playerStatus: KuitoEmitter<AudioPlayerStatus>? = null
    private var recorderStatus: KuitoEmitter<AudioRecorderStatus>? = null
    private var interruption: KuitoEmitter<AudioInterruption>? = null

    override fun nextId(): Double {
        ids += 1
        return ids
    }

    override fun createPlayer(request: AudioPlayerRequest) {
        val id = request.id

        if (id in players) throw KuitoModuleError("ERR_ARGUMENT", "A player with id ${id.toInt()} already exists")

        observe()
        players[id] = KuitoAudioPlayer(id, request, app, session) {
            playerStatus?.send(it)
            session.settle()
        }
    }

    override fun play(id: Double) {
        val player = player(id)

        session.forget(player)
        try {
            player.play()
            session.settle()
        } catch (refused: KuitoModuleError) {
            player.pause()
            throw refused
        }
    }

    override fun pause(id: Double) {
        val player = player(id)

        session.forget(player)
        player.pause()
    }

    override fun seekTo(id: Double, seconds: Double) = player(id).seekTo(seconds)

    override fun setVolume(id: Double, volume: Double) = player(id).setVolume(volume)

    override fun setRate(id: Double, rate: Double) = player(id).setRate(rate)

    override fun setLoop(id: Double, loop: Boolean) = player(id).setLoop(loop)

    override fun releasePlayer(id: Double) {
        players.remove(id)?.release()
        settle()
    }

    override fun createRecorder(request: AudioRecorderRequest) {
        val id = request.id

        if (id in recorders) throw KuitoModuleError("ERR_ARGUMENT", "A recorder with id ${id.toInt()} already exists")

        val recorder = KuitoAudioRecorder(id, request, app) { recorderStatus?.send(it) }

        observe()
        recorders[id] = recorder
    }

    override fun startRecording(id: Double, promise: KuitoPromise<Unit>) {
        val recorder = try {
            recorder(id).also {
                if (!declaresMicrophone())
                    throw KuitoModuleError("ERR_PERMISSION", "AudioRecorder.start: add permissions.microphone to kuito.config.ts; Android needs RECORD_AUDIO declared to ask")
            }
        } catch (error: KuitoModuleError) {
            return promise.reject(error)
        }

        KuitoPermissions.request(context.activity, KuitoPermission.MICROPHONE) { response ->
            if (response.status != KuitoPermissionStatus.GRANTED)
                return@request promise.reject("ERR_PERMISSION", "AudioRecorder.start: the microphone permission is ${response.status.wire}")

            try {
                recorder.start()
                promise.resolve()
            } catch (error: KuitoModuleError) {
                promise.reject(error)
            }
        }
    }

    override fun pauseRecording(id: Double) = recorder(id).pause()

    override fun stopRecording(id: Double) = recorder(id).stop()

    override fun releaseRecorder(id: Double) {
        recorders.remove(id)?.release()
        settle()
    }

    override fun setAudioMode(mode: AudioMode) {
        session.focus.mode = KuitoAudioFocus.Mode.from(mode)
        session.settle()
    }

    override fun startPlayerStatus(emitter: KuitoEmitter<AudioPlayerStatus>) {
        playerStatus = emitter
    }

    override fun stopPlayerStatus() {
        playerStatus = null
    }

    override fun startRecorderStatus(emitter: KuitoEmitter<AudioRecorderStatus>) {
        recorderStatus = emitter
    }

    override fun stopRecorderStatus() {
        recorderStatus = null
    }

    override fun startInterruption(emitter: KuitoEmitter<AudioInterruption>) {
        interruption = emitter
    }

    override fun stopInterruption() {
        interruption = null
    }

    override fun destroy() {
        players.values.forEach { it.release() }
        recorders.values.forEach { it.release() }
        players.clear()
        recorders.clear()
        settle()
        KuitoAudioFocus.appMode = KuitoAudioFocus.Mode.initial
    }

    private fun player(id: Double) = players[id] ?: throw KuitoModuleError("ERR_NOT_FOUND", "No player with id ${id.toInt()}; it was released")

    private fun recorder(id: Double) = recorders[id] ?: throw KuitoModuleError("ERR_NOT_FOUND", "No recorder with id ${id.toInt()}; it was released")

    private fun declaresMicrophone() =
        app.packageManager.getPackageInfo(app.packageName, PackageManager.GET_PERMISSIONS)
            .requestedPermissions.orEmpty().contains(Manifest.permission.RECORD_AUDIO)

    /**
     * Pauses everything when the app goes to the background, unless the mode
     * keeps it playing, and tells the app about interruptions, which the
     * session has already paused the players for.
     */
    private fun observe() {
        if (observing != null) return

        val lifecycle = KuitoAppLifecycle.observe { event ->
            val background = event == KuitoAppLifecycle.Event.Changed(KuitoAppLifecycle.State.BACKGROUND)

            if (background && !session.focus.mode.staysActiveInBackground) {
                players.values.forEach { it.pause() }
                recorders.values.forEach { it.pause() }
            }
        }
        val interruptions = session.observeInterruptions { began, shouldResume ->
            if (began) recorders.values.forEach { it.pause() }
            val type = if (began) AudioInterruptionType.BEGAN else AudioInterruptionType.ENDED

            interruption?.send(AudioInterruption(type = type, shouldResume = shouldResume))
        }

        observing = {
            lifecycle()
            interruptions()
        }
    }

    /** With nothing left to play or record, stops observing. */
    private fun settle() {
        if (players.isNotEmpty() || recorders.isNotEmpty()) return

        observing?.invoke()
        observing = null
    }
}
