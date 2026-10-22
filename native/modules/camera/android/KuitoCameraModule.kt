package dev.kuito.runtime.modules.camera

import dev.kuito.link.CameraPicture
import dev.kuito.link.CameraRecording
import dev.kuito.link.CameraSpec
import dev.kuito.link.PictureOptions
import dev.kuito.link.RecordingOptions
import dev.kuito.runtime.link.KuitoModuleView
import dev.kuito.runtime.link.KuitoPromise
import dev.kuito.runtime.modules.KuitoErrorCode
import dev.kuito.runtime.modules.KuitoModuleContext
import dev.kuito.runtime.modules.KuitoModuleError
import dev.kuito.runtime.modules.KuitoType

/**
 * `Camera` in native/modules/camera/camera.ts: a view and the methods its
 * ref calls. Each view binds its own camera (KuitoCameraView).
 */
class KuitoCameraModule(@Suppress("UNUSED_PARAMETER") context: KuitoModuleContext) : CameraSpec {
    override fun view(): KuitoModuleView<*> = KuitoModuleView(::KuitoCameraView) { view ->
        view.prop("facing", KuitoType.optional(KuitoType.enum(KuitoCameraFacing.values()))) { camera, value ->
            camera.configuration = camera.configuration.copy(facing = value ?: KuitoCameraFacing.BACK)
        }
        view.prop("mode", KuitoType.optional(KuitoType.enum(KuitoCameraMode.values()))) { camera, value ->
            camera.configuration = camera.configuration.copy(mode = value ?: KuitoCameraMode.PICTURE)
        }
        view.prop("flash", KuitoType.optional(KuitoType.enum(KuitoCameraFlash.values()))) { camera, value ->
            camera.configuration = camera.configuration.copy(flash = value ?: KuitoCameraFlash.OFF)
        }
        view.prop("torch", KuitoType.optional(KuitoType.boolean)) { camera, value ->
            camera.configuration = camera.configuration.copy(torch = value == true)
        }
        view.prop("zoom", KuitoType.optional(KuitoType.double)) { camera, value ->
            camera.configuration = camera.configuration.copy(zoom = value ?: 0.0)
        }
        view.prop("mute", KuitoType.optional(KuitoType.boolean)) { camera, value ->
            camera.configuration = camera.configuration.copy(mute = value == true)
        }
        view.prop("barcodes", KuitoType.optional(KuitoType.list(KuitoBarcodeType.type))) { camera, value ->
            camera.configuration = camera.configuration.copy(barcodeTypes = value.orEmpty())
        }
    }

    override fun takePicture(view: android.view.View, options: PictureOptions?, promise: KuitoPromise<CameraPicture>) =
        camera(view).takePicture(options?.quality ?: 1.0, options?.bytes == true, promise)

    override fun startRecording(view: android.view.View, options: RecordingOptions?, promise: KuitoPromise<CameraRecording>) =
        camera(view).startRecording(options?.maxDuration, promise)

    override fun stopRecording(view: android.view.View, promise: KuitoPromise<CameraRecording>) =
        camera(view).stopRecording(promise)

    override fun pausePreview(view: android.view.View) = camera(view).pausePreview()

    override fun resumePreview(view: android.view.View) = camera(view).resumePreview()

    private fun camera(view: android.view.View) =
        view as? KuitoCameraView ?: throw KuitoModuleError(KuitoErrorCode.VIEW_NOT_FOUND, "The view is not a Camera")
}
