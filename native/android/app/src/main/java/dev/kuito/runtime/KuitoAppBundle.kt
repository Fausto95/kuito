package dev.kuito.runtime

import android.content.Context
import java.io.File
import java.io.FileNotFoundException

/**
 * The kernel and app the shell runs, as bytecode: the ones its assets embed
 * under `kuito/`, or the over-the-air update the release shell chose at
 * launch (docs/updates.md).
 */
object KuitoAppBundle {
    /** The running update's directory; null runs the embedded bytecode. Set once, before the engine starts. */
    @Volatile
    var update: File? = null

    /** A script by its path, like `app.hbc` or `modules/<chunk>.hbc`. */
    fun read(context: Context, path: String): ByteArray =
        update?.let { File(it, path).readBytes() } ?: context.assets.open("kuito/$path").use { it.readBytes() }

    /** The UI kernel, `ui.hbc`, which the kernel asks for the first time the app needs the UI thread. */
    fun uiKernel(context: Context): ByteArray = shipped(context, "ui.hbc")

    /** A release build's UI bundle, `app-ui.hbc`, which the app asks for with its first UI-thread operations. */
    fun uiBundle(context: Context): ByteArray = shipped(context, "app-ui.hbc")

    /**
     * A UI-thread script as bytecode: the update's when one runs, since the
     * script that asks for it names it by hash. Empty when missing, which the
     * UI runtime reports.
     */
    private fun shipped(context: Context, path: String): ByteArray = try {
        read(context, path)
    } catch (_: FileNotFoundException) {
        ByteArray(0)
    }

    /** A chunk is a name, never a path: nothing outside `modules` loads, signed or not. */
    private val CHUNK = Regex("[A-Za-z0-9_-][A-Za-z0-9._-]*")

    /** A chunk of the app the kernel requires by name, or null when the app has none. */
    fun chunk(context: Context, name: String): ByteArray? = try {
        if (CHUNK.matches(name)) read(context, "modules/$name.hbc") else null
    } catch (_: FileNotFoundException) {
        null
    }
}
