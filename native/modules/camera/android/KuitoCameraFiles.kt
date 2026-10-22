package dev.kuito.runtime.modules.camera

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.camera.core.ImageProxy
import dev.kuito.link.CameraPicture
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.Buffer
import java.nio.ByteBuffer
import java.util.UUID

/**
 * Where pictures and videos go: the app's cache, which `<Image source>` and
 * FileSystem read (`cacheDirectory`), and the system may clear.
 */
object KuitoCameraFiles {
    fun file(context: Context, extension: String): File =
        File(context.cacheDir, "Camera").apply { mkdirs() }.resolve("${UUID.randomUUID()}.$extension")

    /**
     * Writes a captured JPEG upright, at [quality]: CameraX hands it over in
     * the sensor's orientation, with the turn it needs beside it. Blocks; call
     * it off the UI thread.
     */
    fun picture(context: Context, image: ImageProxy, quality: Double, bytes: Boolean): CameraPicture {
        val buffer = image.planes[0].buffer
        val captured = ByteArray(buffer.remaining()).also { buffer.get(it) }
        val decoded = BitmapFactory.decodeByteArray(captured, 0, captured.size)
            ?: throw IllegalStateException("the camera returned no image")
        val turn = image.imageInfo.rotationDegrees
        val upright = if (turn == 0) decoded else
            Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, Matrix().apply { postRotate(turn.toFloat()) }, true)
        val file = file(context, "jpg")
        val jpeg = ByteArrayOutputStream()

        upright.compress(Bitmap.CompressFormat.JPEG, (quality.coerceIn(0.0, 1.0) * 100).toInt(), jpeg)
        val written = jpeg.toByteArray()

        file.writeBytes(written)

        return CameraPicture(
            uri = Uri.fromFile(file).toString(),
            width = upright.width.toDouble(),
            height = upright.height.toDouble(),
            bytes = if (bytes) ByteBuffer.allocateDirect(written.size).put(written).also { (it as Buffer).flip() } else null,
        )
    }
}
