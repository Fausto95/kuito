package dev.kuito.runtime.modules.filesystem

import android.content.Context
import android.net.Uri
import dev.kuito.runtime.modules.KuitoModuleError
import java.io.File

/**
 * The places FileSystem may touch, and the check every URI passes before it
 * does: reads stay in the files, cache and bundled asset directories, writes
 * inside the files and cache directories only. Paths are canonical, so `..`
 * and symlinks can't climb out.
 */
internal class KuitoSandbox(context: Context) {
    /** A URI's target: a file, or a path in the APK's assets. */
    sealed interface Entry {
        class Disk(val file: File) : Entry
        class Asset(val path: String) : Entry
    }

    val document: File = context.filesDir.canonicalFile
    val cache: File = context.cacheDir.canonicalFile

    fun read(uri: String): Entry {
        val parsed = Uri.parse(uri)

        if (parsed.scheme == "asset") return Entry.Asset(parsed.path.orEmpty().trim('/'))

        val file = file(uri, parsed)

        if (listOf(document, cache).none { file == it || file.startsWith(it) }) outside(uri)

        return Entry.Disk(file)
    }

    /** A write lands strictly inside a writable directory, so they can't be deleted or replaced. */
    fun write(uri: String): File {
        val parsed = Uri.parse(uri)

        if (parsed.scheme == "asset")
            throw KuitoModuleError("ERR_SANDBOX", "$uri is in the app's bundled assets, which are read-only")

        val file = file(uri, parsed)

        if (listOf(document, cache).none { file != it && file.startsWith(it) }) outside(uri)

        return file
    }

    private fun file(uri: String, parsed: Uri): File {
        val path = parsed.path

        if (parsed.scheme != "file" || path.isNullOrEmpty())
            throw KuitoModuleError("ERR_URI", "'$uri' is not a file:// URI")

        return File(path).canonicalFile
    }

    private fun outside(uri: String): Nothing = throw KuitoModuleError(
        "ERR_SANDBOX",
        "$uri is outside the app's sandbox: use a URI under documentDirectory or cacheDirectory",
    )

    companion object {
        const val BUNDLE = "asset:///"

        /** A directory's URI ends with `/`, so names append to it. */
        fun uri(file: File): String = Uri.fromFile(file).toString() + if (file.isDirectory) "/" else ""
    }
}
