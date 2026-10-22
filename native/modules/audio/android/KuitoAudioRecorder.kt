package dev.kuito.runtime.modules.audio

import android.content.Context
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import dev.kuito.link.AudioRecorderRequest
import dev.kuito.link.AudioRecorderStatus
import dev.kuito.link.AudioRecording
import dev.kuito.link.RecordingFormat
import dev.kuito.link.RecordingQuality
import dev.kuito.runtime.modules.KuitoModuleError
import java.io.File
import java.util.UUID
import kotlin.math.log10

/**
 * One `AudioRecorder` (src/native/audio.ts): a MediaRecorder per file, made
 * on the first `start` after `stop`. It reports when it starts and stops, and
 * its level every [LEVEL_INTERVAL] while metering; JavaScript has the UI
 * thread move `time` in between. UI thread only.
 */
class KuitoAudioRecorder(
    val id: Double,
    request: AudioRecorderRequest,
    private val context: Context,
    private val report: (AudioRecorderStatus) -> Unit,
) {
    private class Quality(val sampleRate: Int, val channels: Int, val bitRate: Int)

    private val quality = qualities.getValue(request.quality)
    private val metering = request.metering
    private val ticks = Handler(Looper.getMainLooper())
    private var recorder: MediaRecorder? = null
    private var file: File? = null
    private var recording = false

    /** MediaRecorder doesn't say how long it has recorded: the time before the last pause, and when it resumed. */
    private var recorded = 0L
    private var resumedAt = 0L

    private val tick = object : Runnable {
        override fun run() {
            send()
            ticks.postDelayed(this, LEVEL_INTERVAL)
        }
    }

    init {
        if (request.format != RecordingFormat.AAC)
            throw KuitoModuleError("ERR_UNSUPPORTED", "Android records 'aac' only; MediaRecorder has no WAV encoder (docs/audio.md)")
    }

    /** Resumes a paused file, or starts a new one in the cache directory. */
    fun start() {
        recorder?.let {
            if (!recording) it.resume()
            return started()
        }

        val next = File(context.cacheDir, "recording-${UUID.randomUUID()}.m4a")
        val media = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else @Suppress("DEPRECATION") MediaRecorder()

        try {
            media.setAudioSource(MediaRecorder.AudioSource.MIC)
            media.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            media.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            media.setAudioSamplingRate(quality.sampleRate)
            media.setAudioChannels(quality.channels)
            media.setAudioEncodingBitRate(quality.bitRate)
            media.setOutputFile(next.path)
            media.prepare()
            media.start()
        } catch (failure: Exception) {
            media.release()
            next.delete()
            throw KuitoModuleError("ERR_RECORDING", "The recorder could not start; another app may hold the microphone (${failure.message})")
        }

        recorder = media
        file = next
        recorded = 0
        started()
    }

    fun pause() {
        val media = recorder ?: return send()

        if (recording) {
            media.pause()
            recorded = elapsed()
            recording = false
        }
        ticks.removeCallbacks(tick)
        send()
    }

    fun stop(): AudioRecording {
        val media = recorder ?: throw KuitoModuleError("ERR_NOT_RECORDING", "AudioRecorder.stop: nothing was recorded since the last stop")
        val output = file ?: throw IllegalStateException("A recorder without its file")
        val duration = elapsed() / 1000.0

        try {
            media.stop()
        } catch (empty: RuntimeException) {
            // MediaRecorder throws when it stopped before writing any audio.
            output.delete()
            throw KuitoModuleError("ERR_RECORDING", "AudioRecorder.stop: nothing was recorded")
        } finally {
            media.release()
            reset()
        }

        return AudioRecording(uri = Uri.fromFile(output).toString(), duration = duration)
    }

    /** Discards an unfinished file: nothing else knows its URI. */
    fun release() {
        recorder?.release()
        file?.delete()
        reset()
    }

    private fun reset() {
        recorder = null
        file = null
        recording = false
        recorded = 0
        ticks.removeCallbacks(tick)
        send()
    }

    private fun started() {
        if (!recording) {
            recording = true
            resumedAt = SystemClock.elapsedRealtime()
        }
        ticks.removeCallbacks(tick)
        if (metering) ticks.postDelayed(tick, LEVEL_INTERVAL)
        send()
    }

    private fun elapsed() = recorded + if (recording) SystemClock.elapsedRealtime() - resumedAt else 0

    private fun send() {
        val level = if (!metering) null else recorder?.takeIf { recording }?.maxAmplitude?.let(::dbfs) ?: SILENCE

        report(AudioRecorderStatus(id = id, recording = recording, currentTime = elapsed() / 1000.0, metering = level))
    }

    private companion object {
        const val SILENCE = -160.0

        /** Milliseconds between level samples while metering; src/native/audio.ts eases between them over the same time. */
        const val LEVEL_INTERVAL = 100L

        /** Sample rate, channels and AAC bit rate per quality, as on iOS; docs/audio.md lists them. */
        val qualities = mapOf(
            RecordingQuality.LOW to Quality(22_050, 1, 64_000),
            RecordingQuality.MEDIUM to Quality(44_100, 1, 96_000),
            RecordingQuality.HIGH to Quality(44_100, 2, 128_000),
        )

        /** The loudest 16-bit sample since the last read, in dBFS. */
        fun dbfs(amplitude: Int) = if (amplitude <= 0) SILENCE else (20 * log10(amplitude / 32767.0)).coerceAtLeast(SILENCE)
    }
}
