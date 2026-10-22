package dev.kuito.runtime.modules.camera

import android.graphics.RectF
import androidx.annotation.OptIn
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.view.PreviewView
import androidx.camera.view.transform.CoordinateTransform
import androidx.camera.view.transform.ImageProxyTransformFactory
import androidx.camera.view.transform.OutputTransform
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Barcode scanning for a CameraView: an ImageAnalysis use case whose frames
 * ML Kit decodes. Each code is reported once as it comes into view, with its
 * bounds mapped through [preview] into the view's points, as on iOS. The view
 * binds [analysis] only while [types] is non-empty. UI thread only.
 */
internal class KuitoCameraScanner(private val preview: PreviewView, private val scanned: (Map<String, Any?>) -> Unit) {
    val analysis: ImageAnalysis = ImageAnalysis.Builder()
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
        .build()

    /** Empty stops scanning and releases the decoder. */
    var types: List<KuitoBarcodeType> = emptyList()
        set(value) {
            if (field == value) return

            field = value
            restart()
        }

    private val main = ContextCompat.getMainExecutor(preview.context)
    // ML Kit's boxes are in the upright frame, so the transform starts there.
    private val frames = ImageProxyTransformFactory().apply { isUsingRotationDegrees = true }
    private var client: BarcodeScanner? = null
    /** The codes in view, as `<format>\u001f<data>`. */
    private var visible: Set<String> = emptySet()

    private fun restart() {
        analysis.clearAnalyzer()
        client?.close()
        client = null
        visible = emptySet()

        val formats = types.flatMap { it.formats.asIterable() }.distinct()

        if (formats.isEmpty()) return

        val next = BarcodeScanning.getClient(
            BarcodeScannerOptions.Builder().setBarcodeFormats(formats.first(), *formats.drop(1).toIntArray()).build(),
        )

        client = next
        analysis.setAnalyzer(work) { image -> analyze(next, image) }
    }

    /** Holds the frame until ML Kit is done with it: the latest frame waits meanwhile. */
    @OptIn(ExperimentalGetImage::class)
    private fun analyze(decoder: BarcodeScanner, image: ImageProxy) {
        val media = image.image ?: return image.close()
        val frame = frames.getOutputTransform(image)

        decoder.process(InputImage.fromMediaImage(media, image.imageInfo.rotationDegrees))
            .addOnSuccessListener(main) { codes -> if (decoder === client) found(codes, frame) }
            .addOnCompleteListener(main) { image.close() }
    }

    private fun found(codes: List<Barcode>, frame: OutputTransform) {
        // Null until the preview streams: nothing is on screen to place codes on.
        val view = preview.outputTransform ?: return
        val transform = CoordinateTransform(frame, view)
        val density = preview.resources.displayMetrics.density
        val next = mutableSetOf<String>()

        for (code in codes) {
            val type = KuitoBarcodeType.of(code.format) ?: continue
            val raw = code.rawValue ?: continue
            val box = code.boundingBox ?: continue
            // iOS reads UPC-A as the EAN-13 it is, with a leading zero.
            val data = if (code.format == Barcode.FORMAT_UPC_A) "0$raw" else raw
            val key = type.wire + "\u001f" + data

            next.add(key)

            if (key in visible) continue

            // A mirrored (front) preview flips the box; sort() puts left before right again.
            val bounds = RectF(box).also(transform::mapRect).apply { sort() }

            scanned(mapOf(
                "format" to type.wire,
                "data" to data,
                "bounds" to mapOf(
                    "x" to bounds.left / density.toDouble(),
                    "y" to bounds.top / density.toDouble(),
                    "width" to bounds.width() / density.toDouble(),
                    "height" to bounds.height() / density.toDouble(),
                ),
            ))
        }

        visible = next
    }

    private companion object {
        /** Hands frames to ML Kit, which decodes on its own threads. */
        val work: ExecutorService = Executors.newSingleThreadExecutor { Thread(it, "KuitoCameraScan") }
    }
}
