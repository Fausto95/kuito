package dev.kuito.runtime.modules.imagepicker

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.pm.PackageManager
import android.os.Build
import android.provider.MediaStore
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts.CaptureVideo
import androidx.activity.result.contract.ActivityResultContracts.PickMultipleVisualMedia
import androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia
import androidx.activity.result.contract.ActivityResultContracts.TakePicture
import androidx.core.content.FileProvider
import dev.kuito.link.ImagePickerSpec
import dev.kuito.link.MediaAsset
import dev.kuito.link.MediaPickerRequest
import dev.kuito.runtime.link.KuitoPromise
import dev.kuito.runtime.modules.KuitoActivityResults
import dev.kuito.runtime.modules.KuitoModuleContext
import dev.kuito.runtime.modules.KuitoModuleError
import dev.kuito.runtime.modules.permissions.KuitoPermission
import dev.kuito.runtime.modules.permissions.KuitoPermissionStatus
import dev.kuito.runtime.modules.permissions.KuitoPermissions
import java.io.File
import java.util.concurrent.Executors
import kotlin.math.min

/**
 * `ImagePicker` in native/modules/image-picker/image-picker.ts: the Photo Picker
 * (`PickVisualMedia`, backported by androidx.activity where the system lacks
 * it) and the system camera app, both through [KuitoActivityResults].
 */
class KuitoImagePickerModule(private val context: KuitoModuleContext) : ImagePickerSpec {
    private val media by lazy { KuitoPickedMedia(context.applicationContext) }
    /** Copies, decodes and encodes off the UI thread, one asset after another. */
    private val worker = Executors.newSingleThreadExecutor()

    override fun launchImageLibrary(request: MediaPickerRequest, promise: KuitoPromise<List<MediaAsset>>) {
        unsupportedEditing(request)

        val input = PickVisualMediaRequest(visualMediaType(request))
        val activity = context.activity

        if (request.selectionLimit == 1.0) {
            KuitoActivityResults.launch(activity, PickVisualMedia(), input) { uri -> process(promise) { listOfNotNull(uri).map { media.picked(it, request) } } }
        } else {
            KuitoActivityResults.launch(activity, multiple(request.selectionLimit.toInt()), input) { uris -> process(promise) { uris.map { media.picked(it, request) } } }
        }
    }

    override fun launchCamera(request: MediaPickerRequest, promise: KuitoPromise<List<MediaAsset>>) {
        val activity = context.activity

        unsupportedEditing(request)
        withCamera(activity, promise) { capture(activity, request, promise) }
    }

    override fun destroy() {
        worker.shutdown()
    }

    private fun capture(activity: Activity, request: MediaPickerRequest, promise: KuitoPromise<List<MediaAsset>>) {
        // Video only when nothing but video is asked for: the camera app takes one or the other.
        val video = request.videos && !request.images
        val file = media.newFile(if (video) "mp4" else "jpg")
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.kuito.imagepicker", file)
        val done = { saved: Boolean ->
            process(promise) {
                when {
                    !saved || file.length() == 0L -> emptyList<MediaAsset>().also { file.delete() }
                    video -> listOf(media.recorded(file))
                    else -> listOf(media.captured(file, request))
                }
            }
        }

        try {
            if (video) KuitoActivityResults.launch(activity, CaptureVideo(), uri, done)
            else KuitoActivityResults.launch(activity, TakePicture(), uri, done)
        } catch (_: ActivityNotFoundException) {
            file.delete()
            throw KuitoModuleError("ERR_CAMERA_UNAVAILABLE", "No camera app is installed")
        }
    }

    /**
     * Capturing through another app needs no permission, unless this app
     * declares CAMERA: then Android refuses the intent until it is granted.
     */
    private fun withCamera(activity: Activity, promise: KuitoPromise<List<MediaAsset>>, launch: () -> Unit) {
        if (!declares(activity, Manifest.permission.CAMERA)) return launch()

        KuitoPermissions.request(activity, KuitoPermission.CAMERA) { response ->
            if (response.status != KuitoPermissionStatus.GRANTED)
                return@request promise.reject("ERR_PERMISSION", "The camera permission is ${response.status.wire}")

            try {
                launch()
            } catch (error: Exception) {
                promise.reject(error)
            }
        }
    }

    /** Runs `assets` on the worker and settles `promise` with them. */
    private fun process(promise: KuitoPromise<List<MediaAsset>>, assets: () -> List<MediaAsset>) {
        worker.execute {
            try {
                promise.resolve(assets())
            } catch (error: Exception) {
                promise.reject(error)
            }
        }
    }

    private fun unsupportedEditing(request: MediaPickerRequest) {
        if (request.allowsEditing)
            throw KuitoModuleError("ERR_UNSUPPORTED", "allowsEditing is iOS-only: Android has no system image editor")
    }

    private fun visualMediaType(request: MediaPickerRequest) = when {
        request.images && request.videos -> PickVisualMedia.ImageAndVideo
        request.videos -> PickVisualMedia.VideoOnly
        else -> PickVisualMedia.ImageOnly
    }

    /** The system caps how many items its picker returns; 0 asks for that cap. */
    private fun multiple(limit: Int): PickMultipleVisualMedia {
        val cap = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) MediaStore.getPickImagesMaxLimit() else Int.MAX_VALUE

        return if (limit == 0) PickMultipleVisualMedia() else PickMultipleVisualMedia(min(limit, cap))
    }

    @Suppress("DEPRECATION") // The flags overload is API 33+; this one works everywhere.
    private fun declares(activity: Activity, permission: String) =
        activity.packageManager.getPackageInfo(activity.packageName, PackageManager.GET_PERMISSIONS)
            .requestedPermissions?.contains(permission) == true
}
