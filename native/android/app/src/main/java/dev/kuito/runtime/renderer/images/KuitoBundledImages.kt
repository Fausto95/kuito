package dev.kuito.runtime.renderer.images

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.drawable.Drawable
import java.io.File

/**
 * Images the compiler bundled into the app (docs/assets.md), by the name it
 * gave them (src/cli/bundled-images.ts): a drawable, which is a raster at its
 * densities or a VectorDrawable converted from SVG, or a raw PDF.
 */
internal object KuitoBundledImages {
    /** PDFs copied out of the APK in this process, by name. */
    private val copied = mutableMapOf<String, File>()

    // The names arrive from the app's JavaScript, so there is no R field to name.
    @SuppressLint("DiscouragedApi")
    fun drawable(context: Context, name: String): Drawable {
        val resources = context.resources
        val drawable = resources.getIdentifier(name, "drawable", context.packageName)

        if (drawable != 0) return requireNotNull(context.getDrawable(drawable)) { "Image $name: not a drawable" }

        val raw = resources.getIdentifier(name, "raw", context.packageName)

        require(raw != 0) { "The app was built without the image $name: build it again (docs/assets.md)" }

        return KuitoPdfDrawable(pdf(context, name, raw), resources.displayMetrics.density)
    }

    /** PdfRenderer reads a seekable file, which a resource in the APK is not. */
    private fun pdf(context: Context, name: String, raw: Int): File = copied.getOrPut(name) {
        val file = File(context.cacheDir, "KuitoImages/bundled/$name.pdf")

        file.parentFile?.mkdirs()
        context.resources.openRawResource(raw).use { input -> file.outputStream().use(input::copyTo) }

        file
    }
}
