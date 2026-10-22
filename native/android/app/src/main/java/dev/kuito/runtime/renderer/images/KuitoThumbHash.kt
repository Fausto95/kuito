package dev.kuito.runtime.renderer.images

import android.graphics.Bitmap

/**
 * The ThumbHash an Image's `thumbhash` holds, decoded by the shared decoder
 * (native/shared/ThumbHash.h). Immutable, so any thread may decode it.
 */
internal class KuitoThumbHash private constructor(private val text: String) {
    /** The blurred preview, at most 32 pixels on its longer side. An image decode: run it off the main thread. */
    fun preview(): Bitmap {
        val packed = checkNotNull(decode(text)) { "ThumbHash '$text' no longer parses" }
        val width = packed[0]
        val height = packed[1]

        return Bitmap.createBitmap(packed, 2, width, width, height, Bitmap.Config.ARGB_8888)
    }

    companion object {
        init {
            System.loadLibrary("kuito_mobile")
        }

        /** Null for text that is not a base64 ThumbHash. Checks the hash, decodes nothing. */
        fun parse(text: String): KuitoThumbHash? = if (valid(text)) KuitoThumbHash(text) else null

        @JvmStatic private external fun valid(text: String): Boolean

        /** The preview as [width, height, then each pixel as ARGB]; null for text that is not a hash. */
        @JvmStatic private external fun decode(text: String): IntArray?
    }
}
