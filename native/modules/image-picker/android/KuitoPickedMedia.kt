package dev.kuito.runtime.modules.imagepicker

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import dev.kuito.link.MediaAsset
import dev.kuito.link.MediaAssetType
import dev.kuito.link.MediaPickerRequest
import dev.kuito.runtime.modules.KuitoModuleError
import java.io.File
import java.util.UUID
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Writes picked and captured media into the app's cache, where `<Image>` and
 * FileSystem read them, and describes each as a [MediaAsset]. Every function here blocks: call it off the
 * UI thread.
 */
class KuitoPickedMedia(private val context: Context) {
    val directory: File get() = File(context.cacheDir, "ImagePicker").apply { mkdirs() }

    fun newFile(extension: String) = File(directory, "${UUID.randomUUID()}.$extension")

    /** A picked item: a `content://` URI the picker granted for now. */
    fun picked(uri: Uri, request: MediaPickerRequest): MediaAsset {
        val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
        val name = displayName(uri)

        if (mime.startsWith("video/")) {
            val extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime) ?: "mp4"
            val file = newFile(extension)

            open(uri).use { input -> file.outputStream().use { input.copyTo(it) } }

            return video(file, mime, name)
        }

        return image({ open(uri) }, name, request)
    }

    /** A capture the camera wrote to `file`, which this replaces with the processed image. */
    fun captured(file: File, request: MediaPickerRequest): MediaAsset =
        try {
            image({ file.inputStream() }, null, request)
        } finally {
            file.delete()
        }

    /** A video the camera recorded to `file`, kept as it is. */
    fun recorded(file: File): MediaAsset = video(file, "video/mp4", null)

    /**
     * Decodes at the smallest power-of-two sample that still covers the
     * target, then scales and turns upright in one pass.
     */
    private fun image(open: () -> java.io.InputStream, name: String?, request: MediaPickerRequest): MediaAsset {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }

        open().use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0)
            throw KuitoModuleError("ERR_IMAGE", "${name ?: "The picked item"} is not an image Android can read")

        val orientation = open().use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) }
        val (degrees, mirrored) = ORIENTATIONS[orientation] ?: (0f to false)
        val turned = degrees == 90f || degrees == -90f
        val uprightWidth = if (turned) bounds.outHeight else bounds.outWidth
        val uprightHeight = if (turned) bounds.outWidth else bounds.outHeight
        val scale = fit(uprightWidth, uprightHeight, request)
        var sample = 1

        while (bounds.outWidth / (sample * 2) >= bounds.outWidth * scale && bounds.outHeight / (sample * 2) >= bounds.outHeight * scale) sample *= 2

        val decoded = open().use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
            ?: throw KuitoModuleError("ERR_IMAGE", "${name ?: "The picked item"} could not be decoded")
        val remaining = (bounds.outWidth * scale) / decoded.width
        val matrix = Matrix().apply {
            setRotate(degrees)
            if (mirrored) postScale(-1f, 1f)
            postScale(remaining.toFloat(), remaining.toFloat())
        }
        val upright = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
        val alpha = upright.hasAlpha()
        val file = newFile(if (alpha) "png" else "jpg")

        file.outputStream().use { output ->
            if (alpha) upright.compress(Bitmap.CompressFormat.PNG, 100, output)
            else upright.compress(Bitmap.CompressFormat.JPEG, (request.quality * 100).roundToInt(), output)
        }

        val asset = MediaAsset(
            uri = Uri.fromFile(file).toString(),
            width = upright.width.toDouble(),
            height = upright.height.toDouble(),
            type = MediaAssetType.IMAGE,
            mimeType = if (alpha) "image/png" else "image/jpeg",
            fileName = fileName(name, file),
            fileSize = file.length().toDouble(),
        )

        decoded.recycle()
        if (upright !== decoded) upright.recycle()

        return asset
    }

    private fun video(file: File, mime: String, name: String?): MediaAsset {
        val retriever = MediaMetadataRetriever()

        try {
            retriever.setDataSource(file.path)

            val read = { key: Int -> retriever.extractMetadata(key)?.toIntOrNull() ?: 0 }
            val turned = read(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION) % 180 != 0
            val width = read(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)
            val height = read(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)

            return MediaAsset(
                uri = Uri.fromFile(file).toString(),
                width = (if (turned) height else width).toDouble(),
                height = (if (turned) width else height).toDouble(),
                type = MediaAssetType.VIDEO,
                mimeType = mime,
                fileName = fileName(name, file),
                fileSize = file.length().toDouble(),
                duration = read(MediaMetadataRetriever.METADATA_KEY_DURATION).toDouble(),
            )
        } finally {
            retriever.release()
        }
    }

    /** The scale that fits `maxWidth` and `maxHeight`; never above 1. */
    private fun fit(width: Int, height: Int, request: MediaPickerRequest) = min(
        1.0,
        min(request.maxWidth?.let { it / width } ?: 1.0, request.maxHeight?.let { it / height } ?: 1.0),
    )

    private fun open(uri: Uri) = context.contentResolver.openInputStream(uri)
        ?: throw KuitoModuleError("ERR_IMAGE", "$uri could not be opened")

    private fun displayName(uri: Uri): String? =
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }

    /** The library's name for the asset with the written file's extension, or the file's own name. */
    private fun fileName(name: String?, file: File) =
        if (name.isNullOrEmpty()) file.name else "${name.substringBeforeLast('.')}.${file.extension}"

    private companion object {
        /** EXIF orientation to the turn and mirror that make the image upright. */
        val ORIENTATIONS = mapOf(
            ExifInterface.ORIENTATION_NORMAL to (0f to false),
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL to (0f to true),
            ExifInterface.ORIENTATION_ROTATE_180 to (180f to false),
            ExifInterface.ORIENTATION_FLIP_VERTICAL to (180f to true),
            ExifInterface.ORIENTATION_TRANSPOSE to (90f to true),
            ExifInterface.ORIENTATION_ROTATE_90 to (90f to false),
            ExifInterface.ORIENTATION_TRANSVERSE to (-90f to true),
            ExifInterface.ORIENTATION_ROTATE_270 to (-90f to false),
        )
    }
}
