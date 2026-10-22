package dev.kuito.runtime.renderer.images

import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.PorterDuff
import android.graphics.PorterDuffColorFilter
import android.graphics.drawable.Drawable
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import java.io.File
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.roundToInt

/**
 * A PDF's first page, drawn by PdfRenderer at the pixel size it appears at,
 * so it stays sharp however the view scales it, as iOS draws a PDF in an
 * asset catalog. Its intrinsic size is the page's, in points as dp.
 */
internal class KuitoPdfDrawable(file: File, private val density: Float) : Drawable() {
    private val renderer = PdfRenderer(ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY))
    private val pageWidth: Int
    private val pageHeight: Int
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
    private var rendered: Bitmap? = null

    init {
        renderer.openPage(0).use { page ->
            pageWidth = page.width
            pageHeight = page.height
        }
    }

    override fun getIntrinsicWidth() = (pageWidth * density).roundToInt()

    override fun getIntrinsicHeight() = (pageHeight * density).roundToInt()

    override fun draw(canvas: Canvas) {
        if (bounds.isEmpty) return

        // ImageView scales the canvas to fit the drawable; render at that scale.
        @Suppress("DEPRECATION")
        val values = FloatArray(9).also(canvas.matrix::getValues)
        val width = ceil(bounds.width() * abs(values[Matrix.MSCALE_X])).toInt().coerceAtLeast(1)
        val height = ceil(bounds.height() * abs(values[Matrix.MSCALE_Y])).toInt().coerceAtLeast(1)
        val bitmap = rendered?.takeIf { it.width == width && it.height == height } ?: render(width, height)

        canvas.drawBitmap(bitmap, null, bounds, paint)
    }

    private fun render(width: Int, height: Int): Bitmap {
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)

        renderer.openPage(0).use { page ->
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
        }

        rendered = bitmap

        return bitmap
    }

    override fun setTintList(tint: ColorStateList?) {
        colorFilter = tint?.let { PorterDuffColorFilter(it.defaultColor, PorterDuff.Mode.SRC_IN) }
    }

    override fun setAlpha(alpha: Int) {
        paint.alpha = alpha
        invalidateSelf()
    }

    override fun setColorFilter(filter: ColorFilter?) {
        paint.colorFilter = filter
        invalidateSelf()
    }

    @Deprecated("Deprecated in Android")
    override fun getOpacity() = PixelFormat.TRANSLUCENT
}
