package dev.kuito.runtime

import android.content.Context
import android.util.Base64
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.PublicKey
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.X509EncodedKeySpec
import java.util.concurrent.TimeUnit
import java.util.concurrent.locks.ReentrantLock

/** Why a shell refused an update (docs/updates.md#on-the-device). */
class KuitoUpdateError(val reason: Reason, detail: String = reason.what) : Exception(detail) {
    enum class Reason(val what: String) {
        /** Not an envelope or a manifest of the format this shell reads. */
        MALFORMED("not an update"),
        SIGNATURE("its signature does not verify with this shell's key"),
        OTHER_APP("it is for another app"),
        OTHER_PLATFORM("it is for another platform"),
        /** Published for another `updates.url`, like a staging update signed with the same key. */
        OTHER_HOST("it was published for another host"),
        /** Made for another shell: native code this one lacks. */
        INCOMPATIBLE("it was built for another shell"),
        /** No newer than what the shell runs or ran: replayed, or a downgrade. */
        STALE("it is no newer than what this shell runs"),
        ROLLED_BACK("this shell rolled it back after a crash loop"),
        /** A script missing, or not the size and hash the manifest signed. */
        FILE("a script is not the one its manifest signed"),
    }
}

/** A manifest whose signature verified (src/cli/update-signing.ts writes it). */
data class KuitoUpdateManifest(
    val id: String,
    val app: String,
    val platform: String,
    val url: String,
    val fingerprint: String,
    val createdAt: Long,
    val files: List<File>,
) {
    data class File(val path: String, val sha256: String, val size: Int)
}

/** What the shell was built with: the updates it takes must match it. */
class KuitoUpdateShell(
    val app: String,
    /** Without a trailing slash. */
    val url: String,
    val publicKey: PublicKey,
    val fingerprint: String,
    /** When its embedded bytecode was built, in milliseconds since 1970. */
    val builtAt: Long,
) {
    companion object {
        /** `kuito-updates.json` in the assets (src/cli/updates.ts); null when the build takes no updates. */
        fun bundled(context: Context): KuitoUpdateShell? {
            val text = try {
                context.assets.open("kuito-updates.json").use { it.readBytes().decodeToString() }
            } catch (_: java.io.FileNotFoundException) {
                return null
            }
            val json = JSONObject(text)

            return KuitoUpdateShell(
                context.packageName, json.getString("url"), KuitoUpdates.publicKey(json.getString("publicKey")),
                json.getString("fingerprint"), json.getLong("builtAt"),
            )
        }
    }
}

/**
 * The release shell's over-the-air updates (docs/updates.md): at launch,
 * the bytecode to run, an update staged by an earlier launch or the one
 * the shell shipped with; after the first frame, a check for a newer one,
 * staged for the next start. Every update is verified twice: when it is
 * fetched, and from disk at each launch that runs it.
 *
 * A launch that crashes, as the crash hook reports, or that never draws
 * counts against the update it ran; [CRASH_LOOP] of them in a row roll it
 * back, and it is refused from then on.
 */
class KuitoUpdates(
    val shell: KuitoUpdateShell,
    private val directory: File,
    /** What the URL serves, null when it serves nothing (a 404), at most `limit` bytes. Off the main thread. */
    private val fetch: (url: String, limit: Int) -> ByteArray? = ::http,
) {
    /** Guards the state file: the crash hook writes it from any thread. */
    private val lock = ReentrantLock()

    /** What this process runs, decided by [launch]. */
    @Volatile
    var running: KuitoUpdateManifest? = null
        private set

    /** The running update's directory, null for the embedded bytecode. */
    val bundle: File? get() = running?.let { folder(it.id) }

    private val identity get() = "${shell.fingerprint}@${shell.builtAt}"
    private val stateFile get() = File(directory, "state.json")

    private fun folder(id: String) = File(directory, id)

    // State

    private class Launch(val update: String?, var drew: Boolean = false, var crashed: Boolean = false)

    private class State(
        /** The shell the rest is for: a store build starts over. */
        val shell: String,
        /** The newest `createdAt` this shell took, or its embedded bytecode's. */
        var newest: Long,
        var current: String? = null,
        var staged: String? = null,
        val refused: MutableList<String> = mutableListOf(),
        var crashes: Int = 0,
        var launch: Launch? = null,
    ) {
        fun toJson(): JSONObject = JSONObject()
            .put("shell", shell).put("newest", newest).put("current", current).put("staged", staged)
            .put("refused", JSONArray(refused)).put("crashes", crashes)
            .put("launch", launch?.let { JSONObject().put("update", it.update).put("drew", it.drew).put("crashed", it.crashed) })

        companion object {
            fun of(json: JSONObject) = State(
                json.getString("shell"), json.getLong("newest"), json.optStringOrNull("current"),
                json.optStringOrNull("staged"),
                json.getJSONArray("refused").let { list -> MutableList(list.length()) { list.getString(it) } },
                json.getInt("crashes"),
                json.optJSONObject("launch")?.let { Launch(it.optStringOrNull("update"), it.getBoolean("drew"), it.getBoolean("crashed")) },
            )

            private fun JSONObject.optStringOrNull(key: String) = if (isNull(key)) null else getString(key)
        }
    }

    private fun read(): State {
        val fresh = State(identity, shell.builtAt)

        if (!stateFile.exists()) return fresh

        val state = runCatching { State.of(JSONObject(stateFile.readText())) }.getOrNull()

        if (state == null || state.shell != identity) {
            // Another shell's updates: none of them fits this one.
            directory.deleteRecursively()
            return fresh
        }

        return state
    }

    private fun write(state: State) {
        try {
            directory.mkdirs()

            val partial = File(directory, "state.json.partial")

            // Whole or not at all, and on disk before it replaces the last: the process may end mid-write.
            java.io.FileOutputStream(partial).use { stream ->
                stream.write(state.toJson().toString().encodeToByteArray())
                stream.fd.sync()
            }

            check(partial.renameTo(stateFile)) { "could not replace $stateFile" }
        } catch (error: Exception) {
            Log.w("Kuito", "Could not keep the updates' state: ${error.message}")
        }
    }

    private fun <T> locked(body: () -> T): T {
        lock.lock()
        try {
            return body()
        } finally {
            lock.unlock()
        }
    }

    private fun change(body: (State) -> Unit) = locked {
        val state = read()

        body(state)
        write(state)
    }

    // Launch

    /** Once, before the engine starts: the update this launch runs, null for the embedded bytecode. */
    fun launch(): KuitoUpdateManifest? {
        var chosen: String? = null

        // Recorded before the update is read: a crash while it is, counts against it.
        change { state ->
            val last = state.launch
            val update = last?.update

            if (last != null && update != null && update == state.current) {
                state.crashes = if (last.crashed || !last.drew) state.crashes + 1 else 0

                if (state.crashes >= CRASH_LOOP) {
                    Log.w("Kuito", "Rolled back the update $update: ${state.crashes} launches in a row crashed")
                    state.refused += update
                    state.current = null
                    state.crashes = 0
                    folder(update).deleteRecursively()
                }
            }

            state.staged?.let { staged ->
                state.current?.let { folder(it).deleteRecursively() }
                state.current = staged
                state.staged = null
                state.crashes = 0
            }

            // A download a killed process left half done.
            directory.listFiles { file -> file.name.startsWith("staging-") }?.forEach { it.deleteRecursively() }

            chosen = state.current
            state.launch = Launch(chosen)
        }

        running = null

        val update = chosen ?: return null

        try {
            running = verifiedOnDisk(update)
        } catch (error: Exception) {
            Log.w("Kuito", "The update $update on disk is damaged, ${error.message}: running the embedded bytecode")
            change { state ->
                folder(update).deleteRecursively()
                if (state.current == update) state.current = null
                state.launch = Launch(null)
            }
        }

        return running
    }

    /** The app drew its first frame. */
    fun drew() = change { it.launch?.drew = true }

    /** The crash hook recorded this process's fatal crash; it may be dying, so this writes at once. */
    fun crashed() {
        // A crash while the lock was held must not hang the handler that reports it.
        if (!lock.tryLock(1, TimeUnit.SECONDS)) return

        try {
            val state = read()

            state.launch?.crashed = true
            write(state)
        } finally {
            lock.unlock()
        }
    }

    private fun verifiedOnDisk(id: String): KuitoUpdateManifest {
        val folder = folder(id)
        val manifest = verify(File(folder, "update.json").readBytes(), shell)

        if (manifest.id != id) throw KuitoUpdateError(KuitoUpdateError.Reason.MALFORMED, "update.json is another update's")

        for (file in manifest.files) check(File(folder, file.path).takeIf { it.isFile }?.readBytes(), file)

        return manifest
    }

    // Check

    /**
     * Fetches the newest update for this shell, verifies it and stages it
     * for the next start: the manifest staged, or null when none is newer.
     * Blocks: off the main thread.
     */
    fun check(): KuitoUpdateManifest? {
        val home = "${shell.url}/android/${shell.fingerprint}"
        val envelope = fetch("$home/update.json", ENVELOPE_LIMIT) ?: return null
        val manifest = verify(envelope, shell)
        val state = locked(::read)

        if (manifest.id in state.refused) throw KuitoUpdateError(KuitoUpdateError.Reason.ROLLED_BACK)
        if (manifest.id == state.current || manifest.id == state.staged) return null
        if (manifest.createdAt <= state.newest) throw KuitoUpdateError(KuitoUpdateError.Reason.STALE)

        val staging = File(directory, "staging-${manifest.id}")

        staging.deleteRecursively()

        try {
            for (file in manifest.files) {
                val data = fetch("$home/${manifest.id}/${file.path}", file.size)
                val target = File(staging, file.path)

                check(data, file)
                target.parentFile?.mkdirs()
                target.writeBytes(checkNotNull(data))
            }

            File(staging, "update.json").writeBytes(envelope)

            var staged = false

            change { current ->
                // Checked again: another check may have staged a newer one meanwhile.
                if (manifest.createdAt <= current.newest || manifest.id in current.refused) return@change

                val target = folder(manifest.id)

                target.deleteRecursively()

                if (!staging.renameTo(target)) return@change

                current.staged?.takeIf { it != current.current }?.let { folder(it).deleteRecursively() }
                current.staged = manifest.id
                current.newest = manifest.createdAt
                staged = true
            }

            return if (staged) manifest else null
        } finally {
            staging.deleteRecursively()
        }
    }

    companion object {
        /** Launches in a row that crash before an update is rolled back: one may be bad luck. */
        const val CRASH_LOOP = 2
        /** The most a manifest's envelope may be; a few hundred scripts' hashes. */
        private const val ENVELOPE_LIMIT = 256 * 1024
        private val FORMATS = setOf(1)
        private val HEX = Regex("[0-9a-f]{64}")
        private val ID = Regex("[0-9a-f]{16}")
        // What a shell loads: the kernels, the root chunk, its UI bundle, and chunks by name (src/cli/device-assets.ts).
        private val SCRIPT = Regex("bootstrap\\.hbc|ui\\.hbc|app\\.hbc|app-ui\\.hbc|modules/[A-Za-z0-9_-][A-Za-z0-9._-]*\\.hbc")
        // The P-256 curve's order has 256 bits; the other curves java.security reads do not.
        private const val P256_BITS = 256

        /** The release shell's, once it installed them. */
        @Volatile
        var shared: KuitoUpdates? = null

        /** The shell's updates in its files, checked by the assets' settings; null when it takes none. */
        fun bundled(context: Context): KuitoUpdates? = try {
            KuitoUpdateShell.bundled(context)?.let { KuitoUpdates(it, File(context.filesDir, "kuito/updates")) }
        } catch (error: Exception) {
            Log.w("Kuito", "Updates are off: ${error.message}")
            null
        }

        /** Base64 SubjectPublicKeyInfo DER of a P-256 key, as kuito.config.ts takes it. */
        fun publicKey(text: String): PublicKey {
            val key = KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(Base64.decode(text, Base64.DEFAULT)))

            require(key is ECPublicKey && key.params.order.bitLength() == P256_BITS) { "The update key is not a P-256 key" }

            return key
        }

        private fun hex(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

        private fun check(data: ByteArray?, file: KuitoUpdateManifest.File) {
            if (data == null || data.size != file.size || hex(data) != file.sha256)
                throw KuitoUpdateError(KuitoUpdateError.Reason.FILE, "${file.path} is not the script its manifest signed")
        }

        /**
         * The manifest of an envelope the shell's key signed, for its app,
         * platform and fingerprint. Untrusted until here.
         */
        fun verify(envelope: ByteArray, shell: KuitoUpdateShell): KuitoUpdateManifest {
            fun malformed(what: String) = KuitoUpdateError(KuitoUpdateError.Reason.MALFORMED, "not an update: $what")

            val json = runCatching { JSONObject(envelope.decodeToString()) }.getOrNull()
            val text = json?.optString("manifest", "")?.takeIf { it.isNotEmpty() }
            val signed = json?.optString("signature", "")?.takeIf { it.isNotEmpty() }

            if (text == null || signed == null) throw malformed("an envelope holds a manifest and its signature")

            val valid = runCatching {
                Signature.getInstance("SHA256withECDSA").run {
                    initVerify(shell.publicKey)
                    update(text.encodeToByteArray())
                    verify(Base64.decode(signed, Base64.DEFAULT))
                }
            }.getOrDefault(false)

            if (!valid) throw KuitoUpdateError(KuitoUpdateError.Reason.SIGNATURE)

            val manifest = runCatching { parse(JSONObject(text)) }.getOrElse { throw malformed(it.message ?: "manifest") }

            if (manifest.app != shell.app) throw KuitoUpdateError(KuitoUpdateError.Reason.OTHER_APP)
            if (manifest.platform != "android") throw KuitoUpdateError(KuitoUpdateError.Reason.OTHER_PLATFORM)
            if (manifest.url != shell.url) throw KuitoUpdateError(KuitoUpdateError.Reason.OTHER_HOST)
            if (manifest.fingerprint != shell.fingerprint) throw KuitoUpdateError(KuitoUpdateError.Reason.INCOMPATIBLE)

            return manifest
        }

        private fun parse(json: JSONObject): KuitoUpdateManifest {
            require(json.getInt("format") in FORMATS) { "format" }

            val id = json.getString("id").also { require(ID.matches(it)) { "id" } }
            val fingerprint = json.getString("fingerprint").also { require(HEX.matches(it)) { "fingerprint" } }
            val createdAt = json.getLong("createdAt").also { require(it > 0) { "createdAt" } }
            val listed = json.getJSONArray("files")
            val seen = mutableSetOf<String>()

            require(listed.length() > 0) { "files" }

            val files = List(listed.length()) { index ->
                val file = listed.getJSONObject(index)
                val path = file.getString("path")
                val sha256 = file.getString("sha256")
                val size = file.getInt("size")

                require(SCRIPT.matches(path) && seen.add(path) && HEX.matches(sha256) && size >= 0) {
                    "a file is a script's path, its sha256 and its size"
                }

                KuitoUpdateManifest.File(path, sha256, size)
            }

            return KuitoUpdateManifest(
                id, json.getString("app"), json.getString("platform"), json.getString("url"), fingerprint, createdAt, files,
            )
        }

        // 30 s without a byte, not for the whole download: a large update on a slow network still finishes.
        private val client by lazy {
            OkHttpClient.Builder().connectTimeout(30, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).build()
        }

        /** The default seam: a GET over https, past any cache, failing on anything but 200 or 404. */
        private fun http(url: String, limit: Int): ByteArray? {
            val request = Request.Builder().url(url).header("Cache-Control", "no-cache").build()

            client.newCall(request).execute().use { response ->
                if (response.code == 404) return null
                if (response.code != 200) throw java.io.IOException("$url answered ${response.code}")

                // Read no more than the limit: a host may serve anything.
                val body = checkNotNull(response.body).source().run {
                    request(limit + 1L)
                    buffer.readByteArray(minOf(buffer.size, limit + 1L))
                }

                if (body.size > limit) throw java.io.IOException("$url is larger than $limit bytes")

                return body
            }
        }
    }
}
