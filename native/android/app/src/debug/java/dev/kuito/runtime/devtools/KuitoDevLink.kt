package dev.kuito.runtime.devtools

import android.content.Context
import okhttp3.Request
import org.json.JSONObject
import java.io.File

/**
 * Where `kuito dev` said its dev server is, and the session token every
 * request to it carries (src/dev/dev-auth.ts). The CLI writes both into the
 * app's private files through `run-as`, which only adb can use: the activity
 * is exported, so a dev URL taken from its intent could come from any app.
 */
object KuitoDevLink {
    private const val FILE = "kuito-dev-link.json"

    var url = "ws://10.0.2.2:8765"
        private set
    private var token: String? = null

    /** Reads the link `kuito dev` last wrote; without one, the emulator's default server. */
    fun load(context: Context) {
        val file = File(context.filesDir, FILE)

        if (!file.exists()) return

        val link = JSONObject(file.readText())

        url = link.getString("url")
        token = link.optString("token").ifEmpty { null }
    }

    /** A request to the dev server at [url], carrying the session token. */
    fun request(url: String): Request =
        Request.Builder().url(url).apply { token?.let { header("Authorization", "Bearer $it") } }.build()
}
