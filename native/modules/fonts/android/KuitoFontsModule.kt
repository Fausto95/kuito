package dev.kuito.runtime.modules.fonts

import android.net.Uri
import dev.kuito.link.FontFace
import dev.kuito.link.FontFaceStyle
import dev.kuito.link.FontsSpec
import dev.kuito.runtime.modules.KuitoModuleContext
import dev.kuito.runtime.modules.KuitoModuleError
import dev.kuito.runtime.renderer.styling.KuitoFonts
import java.io.File

/**
 * `Fonts` in native/modules/fonts/fonts.ts: registers font files into
 * [KuitoFonts], which the text renderer resolves `fontFamily` through.
 */
class KuitoFontsModule(private val context: KuitoModuleContext) : FontsSpec {
    override fun isLoaded(family: String): Boolean = KuitoFonts.isRegistered(context.applicationContext, family)

    override fun load(faces: List<FontFace>) {
        for (face in faces) {
            val parsed = Uri.parse(face.uri)
            val file = parsed.path?.takeIf { parsed.scheme == "file" }?.let(::File)
                ?: throw KuitoModuleError("ERR_URI", "'${face.uri}' is not a file:// URI")

            if (!file.isFile) throw KuitoModuleError("ERR_NOT_FOUND", "No font file at ${face.uri}")

            try {
                KuitoFonts.register(
                    context.applicationContext,
                    face.family,
                    face.weight.toInt(),
                    face.style == FontFaceStyle.ITALIC,
                    file,
                )
            } catch (error: IllegalArgumentException) {
                throw KuitoModuleError("ERR_FONT", error.message ?: "${file.name} is not a font")
            }
        }
    }
}
