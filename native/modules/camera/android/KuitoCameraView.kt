package dev.kuito.runtime.modules.camera

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Color
import android.net.Uri
import android.view.ViewOutlineProvider
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.camera.core.Camera
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import dev.kuito.link.CameraPicture
import dev.kuito.link.CameraRecording
import dev.kuito.runtime.link.KuitoPromise
import dev.kuito.runtime.modules.KuitoNativeView
import dev.kuito.runtime.modules.KuitoViewEvents
import dev.kuito.runtime.shell.KuitoAppLifecycle
import dev.kuito.runtime.modules.permissions.KuitoPermission
import dev.kuito.runtime.modules.permissions.KuitoPermissionStatus
import dev.kuito.runtime.modules.permissions.KuitoPermissions
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * CameraView: a CameraX preview. The view is its own LifecycleOwner, so
 * CameraX opens the camera while it is resumed: attached, shown, the app in
 * the foreground and the preview not paused, and closes it otherwise. The
 * binding outlives a detach; unmounting destroys the lifecycle, which
 * unbinds the camera for good. UI thread only.
 */
class KuitoCameraView(context: Context, private val events: KuitoViewEvents) :
    FrameLayout(context), LifecycleOwner, KuitoNativeView {
    private enum class Access { UNKNOWN, ASKING, GRANTED, DENIED }

    var configuration = KuitoCameraConfiguration()
        set(value) {
            if (field == value) return

            field = value
            changed()
        }

    private val registry = LifecycleRegistry(this).apply { currentState = Lifecycle.State.CREATED }
    override val lifecycle: Lifecycle get() = registry

    private val preview = PreviewView(context).apply {
        // A TextureView, so a paused preview can keep its last frame (`bitmap`).
        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        scaleType = PreviewView.ScaleType.FILL_CENTER
        // FILL_CENTER scales the TextureView past the preview's bounds, and the
        // renderer unclips the views it creates, so the preview clips itself.
        outlineProvider = ViewOutlineProvider.BOUNDS
        clipToOutline = true
    }
    private val frozen = ImageView(context).apply {
        scaleType = ImageView.ScaleType.CENTER_CROP
        visibility = GONE
    }
    private val previewCase = Preview.Builder().build()
    private val imageCapture = ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build()
    private val videoCapture = VideoCapture.withOutput(
        Recorder.Builder()
            .setQualitySelector(QualitySelector.from(Quality.HD, FallbackStrategy.lowerQualityOrHigherThan(Quality.SD)))
            .build(),
    )
    private val scanner = KuitoCameraScanner(preview) { barcode -> events.emit("barcode", barcode) }
    private val main = ContextCompat.getMainExecutor(context)

    private var provider: ProcessCameraProvider? = null
    private var loading = false
    private var camera: Camera? = null
    private var bound: KuitoCameraConfiguration? = null
    private var recording: Recording? = null
    /** Settled with the video once the recording ends, whatever ends it. */
    private val recorded = mutableListOf<KuitoPromise<CameraRecording>>()
    private var access = Access.UNKNOWN
    private var attached = false
    private var shown = false
    private var paused = false
    private var wanted = false
    private var streaming = false
    /** Reported once until the camera starts again: updates retry what failed. */
    private var failure: Pair<String, String>? = null
    private var stopObserving: (() -> Unit)? = KuitoAppLifecycle.observe { event ->
        if (event is KuitoAppLifecycle.Event.Changed) post { update() }
    }

    init {
        setBackgroundColor(Color.BLACK)
        addView(preview, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(frozen, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        previewCase.surfaceProvider = preview.surfaceProvider
        // Resuming replays the last state, so only a change into streaming is a start.
        preview.previewStreamState.observe(this) { state ->
            val started = state == PreviewView.StreamState.STREAMING && !streaming

            streaming = state == PreviewView.StreamState.STREAMING

            if (!started) return@observe

            frozen.visibility = GONE
            frozen.setImageDrawable(null)
            failure = null
            events.emit("ready")
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        attached = true
        update()
    }

    /** Off screen, not unmounted: the camera stops and keeps its binding. */
    override fun onDetachedFromWindow() {
        attached = false
        update()
        super.onDetachedFromWindow()
    }

    /** Kuito removed the view, or the runtime is reloading: an open recording finalizes and resolves. */
    override fun unmount() {
        stopObserving?.invoke()
        stopObserving = null
        scanner.types = emptyList()
        provider?.unbind(previewCase, imageCapture, videoCapture, scanner.analysis)
        registry.currentState = Lifecycle.State.DESTROYED
        camera = null
        bound = null
    }

    /** Hidden by its own visibility or an ancestor's, as an inactive navigation screen. */
    override fun onVisibilityAggregated(isVisible: Boolean) {
        super.onVisibilityAggregated(isVisible)
        shown = isVisible
        update()
    }

    // Functions

    fun takePicture(quality: Double, bytes: Boolean, promise: KuitoPromise<CameraPicture>) {
        if (camera == null || !registry.currentState.isAtLeast(Lifecycle.State.RESUMED))
            return promise.reject("ERR_NOT_READY", "the camera isn't running; wait for onReady")

        imageCapture.targetRotation = display?.rotation ?: imageCapture.targetRotation
        imageCapture.takePicture(work, object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: ImageProxy) {
                try {
                    promise.resolve(KuitoCameraFiles.picture(context, image, quality, bytes))
                } catch (error: Exception) {
                    promise.reject(error)
                } finally {
                    image.close()
                }
            }

            override fun onError(error: ImageCaptureException) {
                promise.reject("ERR_CAMERA", "the capture failed: ${error.message}")
            }
        })
    }

    fun startRecording(maxDuration: Double?, promise: KuitoPromise<CameraRecording>) {
        when {
            configuration.mode != KuitoCameraMode.VIDEO ->
                return promise.reject("ERR_MODE", "set mode=\"video\" on the CameraView first")
            camera == null || !registry.currentState.isAtLeast(Lifecycle.State.RESUMED) ->
                return promise.reject("ERR_NOT_READY", "the camera isn't running; wait for onReady")
            recording != null ->
                return promise.reject("ERR_RECORDING", "the camera is already recording")
            configuration.mute -> return record(false, maxDuration, promise)
        }

        val activity = activity()
            ?: return promise.reject("ERR_PERMISSION", "no activity to ask for the microphone")

        KuitoPermissions.request(activity, KuitoPermission.MICROPHONE) { response ->
            if (response.status != KuitoPermissionStatus.GRANTED)
                return@request promise.reject("ERR_PERMISSION",
                    "the microphone permission is ${response.status.wire}; record with mute, or ask again")

            record(true, maxDuration, promise)
        }
    }

    fun stopRecording(promise: KuitoPromise<CameraRecording>) {
        val current = recording ?: return promise.reject("ERR_RECORDING", "the camera isn't recording")

        recorded.add(promise)
        current.stop()
    }

    fun pausePreview() {
        // The last frame stays on screen while the camera stops.
        frozen.setImageBitmap(preview.bitmap)
        frozen.visibility = VISIBLE
        paused = true
        update()
    }

    fun resumePreview() {
        paused = false
        update()
    }

    // Session

    /** Runs the camera when it should, asking for it the first time it should, and again each time it comes back after a denial. */
    private fun update() {
        if (registry.currentState == Lifecycle.State.DESTROYED) return

        val should = attached && shown && !paused && KuitoAppLifecycle.state != KuitoAppLifecycle.State.BACKGROUND
        val returning = should && !wanted

        wanted = should
        scanner.types = if (attached) configuration.barcodeTypes else emptyList()

        if (returning && (access == Access.UNKNOWN || access == Access.DENIED)) return ask()

        if (access != Access.GRANTED) return

        if (attached) bind()
        registry.currentState = if (should) Lifecycle.State.RESUMED else Lifecycle.State.CREATED
    }

    private fun ask() {
        val activity = activity() ?: return failed("ERR_PERMISSION", "CameraView: no activity to ask for the camera")

        access = Access.ASKING
        KuitoPermissions.request(activity, KuitoPermission.CAMERA) { response ->
            access = if (response.status == KuitoPermissionStatus.GRANTED) Access.GRANTED else Access.DENIED

            if (access == Access.DENIED)
                failed("ERR_PERMISSION",
                    "Camera access is ${response.status.wire}. Ask with permissions.request('camera'), or send the user to app.openSettings()")

            update()
        }
    }

    /** Binds the use cases the configuration needs, once the provider is up; again when facing, mode or scanning change. */
    private fun bind() {
        val provider = provider ?: return load()
        val next = configuration

        if (bound?.facing == next.facing && bound?.mode == next.mode && bound?.scanning == next.scanning) return

        if (!provider.hasCamera(next.facing.selector)) {
            bound = null

            return failed("ERR_CAMERA_UNAVAILABLE", "This device has no ${next.facing.name.lowercase()} camera")
        }

        provider.unbind(previewCase, imageCapture, videoCapture, scanner.analysis)

        val cases = listOfNotNull(
            previewCase,
            imageCapture,
            videoCapture.takeIf { next.mode == KuitoCameraMode.VIDEO },
            scanner.analysis.takeIf { next.scanning },
        ).toTypedArray()

        camera = try {
            provider.bindToLifecycle(this, next.facing.selector, *cases)
        } catch (error: Exception) {
            bound = null

            return failed("ERR_CAMERA", "The ${next.facing.name.lowercase()} camera can't be used: ${error.message}")
        }.also { camera ->
            camera.cameraInfo.cameraState.removeObservers(this)
            camera.cameraInfo.cameraState.observe(this) { state ->
                state.error?.let { failed("ERR_CAMERA", "The camera stopped: error ${it.code}") }
            }
        }
        bound = next
        controls()
    }

    private fun load() {
        if (loading) return

        val future = ProcessCameraProvider.getInstance(context)

        loading = true
        future.addListener({
            loading = false
            provider = try {
                future.get()
            } catch (error: Exception) {
                return@addListener failed("ERR_CAMERA", "The camera service failed: ${error.message}")
            }

            update()
        }, main)
    }

    private fun changed() {
        imageCapture.flashMode = configuration.flash.mode
        update()
        controls()
    }

    private fun controls() {
        val camera = camera ?: return

        if (camera.cameraInfo.hasFlashUnit()) camera.cameraControl.enableTorch(configuration.torch)

        camera.cameraControl.setLinearZoom(configuration.zoom.coerceIn(0.0, 1.0).toFloat())
    }

    // The microphone was granted when audio is on.
    @SuppressLint("MissingPermission")
    private fun record(audio: Boolean, maxDuration: Double?, promise: KuitoPromise<CameraRecording>) {
        val file = KuitoCameraFiles.file(context, "mp4")
        val options = FileOutputOptions.Builder(file).apply {
            maxDuration?.let { setDurationLimitMillis((it * 1000).toLong()) }
        }.build()
        val pending = videoCapture.output.prepareRecording(context, options)

        recorded.add(promise)
        recording = (if (audio) pending.withAudioEnabled() else pending).start(main) { event ->
            if (event is VideoRecordEvent.Finalize) finished(event, file)
        }
    }

    /** The camera stopping (backgrounding, unmounting) or the duration limit end a recording with an error, yet the file is complete. */
    private fun finished(event: VideoRecordEvent.Finalize, file: File) {
        val promises = recorded.toList()
        val complete = event.error in COMPLETE && file.length() > 0

        recording = null
        recorded.clear()

        if (!complete) {
            file.delete()
            promises.forEach { it.reject("ERR_RECORDING", "the recording failed: error ${event.error}") }

            return
        }

        val video = CameraRecording(uri = Uri.fromFile(file).toString(), duration = event.recordingStats.recordedDurationNanos / 1e9)

        promises.forEach { it.resolve(video) }
    }

    private fun failed(code: String, message: String) {
        if (failure == code to message) return

        failure = code to message
        events.emit("error", mapOf("code" to code, "message" to message))
    }

    private fun activity(): Activity? {
        var current = context

        while (current is ContextWrapper) {
            if (current is Activity) return current
            current = current.baseContext
        }

        return null
    }

    private companion object {
        /** Encodes pictures off the UI thread, for every camera view. */
        val work: ExecutorService = Executors.newSingleThreadExecutor { Thread(it, "KuitoCamera") }

        val COMPLETE = setOf(
            VideoRecordEvent.Finalize.ERROR_NONE,
            VideoRecordEvent.Finalize.ERROR_DURATION_LIMIT_REACHED,
            VideoRecordEvent.Finalize.ERROR_FILE_SIZE_LIMIT_REACHED,
            VideoRecordEvent.Finalize.ERROR_SOURCE_INACTIVE,
        )
    }
}
