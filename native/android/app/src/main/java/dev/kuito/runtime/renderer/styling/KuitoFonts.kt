package dev.kuito.runtime.renderer.styling

import android.content.Context
import android.graphics.Typeface
import org.json.JSONArray
import java.io.File
import java.io.FileNotFoundException

/**
 * The fonts `fontFamily` names beyond the system's: the app's bundled fonts
 * (`assets/fonts/fonts.json`, written by src/cli/fonts.ts) and those
 * `fonts.load` registers. One per process; read from the UI and JS threads.
 */
object KuitoFonts {
    class Face(val weight: Int, val italic: Boolean, val typeface: Typeface)

    private val families = mutableMapOf<String, MutableList<Face>>()
    private var bundled = false

    /** Registers the font file as one face of `family`. */
    fun register(context: Context, family: String, weight: Int, italic: Boolean, file: File) {
        val typeface = try {
            Typeface.createFromFile(file)
        } catch (error: RuntimeException) {
            throw IllegalArgumentException("${file.name} is not a font Android can load", error)
        }

        synchronized(this) {
            loadBundled(context)
            add(family, Face(weight, italic, typeface))
        }
    }

    /** Whether `family` was bundled or loaded. */
    fun isRegistered(context: Context, family: String): Boolean = synchronized(this) {
        loadBundled(context)
        family in families
    }

    /** Whether `fontFamily` takes `family`: registered here, or one of the system's families. */
    fun has(context: Context, family: String): Boolean =
        isRegistered(context, family) || family == "sans-serif" || Typeface.create(family, Typeface.NORMAL) !== Typeface.DEFAULT

    /** The registered face of `family` nearest `weight` and `italic`, or null for a system family. */
    fun typeface(context: Context, family: String, weight: Int, italic: Boolean): Typeface? {
        val faces = synchronized(this) {
            loadBundled(context)
            families[family]?.toList()
        } ?: return null

        return match(faces, weight, italic)?.typeface
    }

    fun missing(family: String) =
        "no font family \"$family\": bundle it with fonts in kuito.config.ts or load it with fonts.load (docs/fonts.md)"

    /**
     * The face CSS would pick: the requested style if the family has it, then
     * the nearest weight in the direction CSS Fonts 4 searches (§5.2).
     */
    private fun match(faces: List<Face>, weight: Int, italic: Boolean): Face? {
        val styled = faces.filter { it.italic == italic }

        return styled.ifEmpty { faces }.minByOrNull { rank(it.weight, weight) }
    }

    /**
     * Lower is nearer. 400 and 500 look up to 500 first, then lighter, then
     * heavier; lighter weights look lighter first, heavier ones heavier.
     */
    private fun rank(candidate: Int, desired: Int) = when {
        desired in 400..500 -> when {
            candidate in desired..500 -> candidate - desired
            candidate < desired -> 1000 + desired - candidate
            else -> 2000 + candidate - desired
        }
        desired < 400 -> if (candidate <= desired) desired - candidate else 1000 + candidate - desired
        else -> if (candidate >= desired) candidate - desired else 1000 + desired - candidate
    }

    private fun add(family: String, face: Face) {
        val faces = families.getOrPut(family) { mutableListOf() }

        faces.removeAll { it.weight == face.weight && it.italic == face.italic }
        faces.add(face)
    }

    /** Once, under the lock: the faces the CLI bundled into the APK's assets. */
    private fun loadBundled(context: Context) {
        if (bundled) return

        bundled = true

        val assets = context.applicationContext.assets
        val manifest = try {
            assets.open("fonts/fonts.json").bufferedReader().use { JSONArray(it.readText()) }
        } catch (error: FileNotFoundException) {
            return
        }

        for (index in 0 until manifest.length()) {
            val font = manifest.getJSONObject(index)

            add(
                font.getString("family"),
                Face(
                    font.getInt("weight"),
                    font.getString("style") == "italic",
                    Typeface.createFromAsset(assets, "fonts/" + font.getString("file")),
                ),
            )
        }
    }
}
