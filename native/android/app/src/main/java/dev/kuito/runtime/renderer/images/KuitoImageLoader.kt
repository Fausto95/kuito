package dev.kuito.runtime.renderer.images

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import android.util.LruCache
import android.util.Size
import dev.kuito.runtime.traced
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.net.URI
import java.security.MessageDigest
import java.util.concurrent.Executors

/** Which caches may serve and keep an image. */
internal enum class CachePolicy(val value: String, val memory: Boolean, val disk: Boolean) {
    MemoryDisk("memory-disk", true, true),
    Memory("memory", true, false),
    Disk("disk", false, true),
    None("none", false, false);

    companion object {
        fun of(value: String) = entries.firstOrNull { it.value == value }
    }
}

/** A decoded bitmap and the size of the image it was decoded from, in pixels: what an Image's `load` and image.prefetch report. */
internal class KuitoLoadedImage(val bitmap: Bitmap, val width: Int, val height: Int, private val sample: Int) {
    /** Whether it shows [target] pixels as well as the full image would. The full image covers any size; null, an unknown size, takes the full image. */
    fun covers(target: Size?): Boolean {
        if (sample == 1) return true

        return target != null && bitmap.width >= target.width && bitmap.height >= target.height
    }
}

/** An image's encoded bytes and the pixel size its header gives. */
private class KuitoImageBytes(val bytes: ByteArray, val width: Int, val height: Int)

/**
 * Loads images once: a memory cache of decoded bitmaps, a disk cache of their
 * bytes, and one request per URL however many views ask for it. An image is
 * decoded at the size its view shows it (docs/primitives.md#image): the memory
 * cache keys it by URL and the power of two it was divided by, and serves any
 * request a larger decode covers. The disk cache keeps the original bytes by
 * URL, so a new size never downloads again. Both key an image by URL alone,
 * so headers that change per request, such as a refreshed token, still find
 * it. Callbacks run on the main thread.
 */
internal object KuitoImageLoader {
    /** Past this a decode is small enough; the bound keeps a cache lookup to a few probes. */
    const val MAX_SAMPLE = 64

    private val main = Handler(Looper.getMainLooper())
    private val workers = Executors.newFixedThreadPool(4)

    /** Its own thread: a preview queued behind blocking fetches would land after the image. */
    private val previews = Executors.newSingleThreadExecutor()
    private val client = OkHttpClient()

    private val memory = object : LruCache<String, KuitoLoadedImage>((Runtime.getRuntime().maxMemory() / 8).toInt()) {
        override fun sizeOf(key: String, value: KuitoLoadedImage) = value.bitmap.byteCount
    }

    /** Waiting callbacks by URL, then by memory key; touched only on the main thread. */
    private val downloads = mutableMapOf<String, MutableList<(Result<KuitoImageBytes>) -> Unit>>()
    private val decodes = mutableMapOf<String, MutableList<(Result<KuitoLoadedImage>) -> Unit>>()

    /** [target] is the view's size in pixels; null decodes the full image. */
    fun load(context: Context, url: String, headers: Map<String, String>, policy: CachePolicy, target: Size?, done: (Result<KuitoLoadedImage>) -> Unit) {
        if (policy.memory) cached(url, target)?.let { return done(Result.success(it)) }

        bytes(context, url, headers, policy.disk) { result ->
            val bytes = result.getOrElse { return@bytes done(Result.failure(it)) }

            if (policy.memory) cached(url, target)?.let { return@bytes done(Result.success(it)) }

            val sample = sample(bytes.width, bytes.height, target)
            val key = key(url, sample)
            val waiting = decodes[key]

            if (waiting != null) {
                waiting.add(done)

                return@bytes
            }

            decodes[key] = mutableListOf(done)

            workers.execute {
                // A header with no image behind it, such as a cut-off file: the next load downloads it again.
                val decoded = runCatching { decode(bytes, sample) }.onFailure { diskFile(context, url)?.delete() }

                main.post {
                    traced("Kuito image ready") {
                        decoded.getOrNull()?.takeIf { policy.memory }?.let { memory.put(key, it) }
                        decodes.remove(key)?.forEach { it(decoded) }
                    }
                }
            }
        }
    }

    /** image.prefetch: the bytes into the disk cache, decoded only when no disk cache would keep them, and the image's size in pixels. */
    fun prefetch(context: Context, url: String, headers: Map<String, String>, policy: CachePolicy, done: (Result<Size>) -> Unit) {
        if (policy.memory) cached(url, null)?.let { return done(Result.success(Size(it.width, it.height))) }

        if (!policy.disk) return load(context, url, headers, policy, null) { result -> done(result.map { Size(it.width, it.height) }) }

        bytes(context, url, headers, true) { result -> done(result.map { Size(it.width, it.height) }) }
    }

    /** Decodes a ThumbHash's preview off the main thread; `done` runs on the main thread. */
    fun preview(hash: KuitoThumbHash, done: (Bitmap) -> Unit) {
        previews.execute {
            val bitmap = traced("Kuito thumbhash decode") { hash.preview() }

            main.post { done(bitmap) }
        }
    }

    fun request(url: String, headers: Map<String, String>): Request =
        Request.Builder().url(url).apply { headers.forEach { (name, value) -> header(name, value) } }.build()

    /** The power of two to divide the image by: the largest that still covers [target] on both sides, so a decode is at most twice the target across. */
    fun sample(width: Int, height: Int, target: Size?): Int {
        if (target == null || target.width <= 0 || target.height <= 0) return 1

        val ratio = minOf(width.toDouble() / target.width, height.toDouble() / target.height)
        var sample = 1

        while (sample < MAX_SAMPLE && sample * 2 <= ratio) sample *= 2

        return sample
    }

    /** The smallest decode that covers [target], probing each sample from the largest. */
    private fun cached(url: String, target: Size?): KuitoLoadedImage? {
        var sample = MAX_SAMPLE

        while (sample >= 1) {
            memory.get(key(url, sample))?.takeIf { it.covers(target) }?.let { return it }
            sample /= 2
        }

        return null
    }

    private fun bytes(context: Context, url: String, headers: Map<String, String>, disk: Boolean, done: (Result<KuitoImageBytes>) -> Unit) {
        val waiting = downloads[url]

        if (waiting != null) {
            waiting.add(done)

            return
        }

        downloads[url] = mutableListOf(done)

        val file = if (disk) diskFile(context, url) else null

        workers.execute {
            val result = runCatching { fetch(url, headers, file) }

            main.post { downloads.remove(url)?.forEach { it(result) } }
        }
    }

    private fun key(url: String, sample: Int) = "$sample $url"

    /** Only remote images are cached on disk; file and data URLs are already local. */
    private fun diskFile(context: Context, url: String) =
        if (url.startsWith("http")) File(File(context.cacheDir, "KuitoImages"), sha256(url)) else null

    private fun fetch(url: String, headers: Map<String, String>, file: File?): KuitoImageBytes {
        file?.takeIf { it.exists() }?.readBytes()?.let(::header)?.let { return it }

        // Already on disk. A file URI may have no authority: java.io.File writes `file:/path`.
        if (url.startsWith("file:"))
            return header(File(URI(url)).readBytes()) ?: throw IOException("The data is not an image")

        val bytes = client.newCall(request(url, headers)).execute().use { response ->
            if (!response.isSuccessful) throw IOException("HTTP ${response.code}")

            response.body?.bytes() ?: throw IOException("Empty response")
        }

        val image = header(bytes) ?: throw IOException("The data is not an image")

        // The system may clear the cache directory while the app runs, so it is checked on each write, never on a read.
        // Written aside and renamed: a process killed mid-write leaves no cut-off file under the URL's name.
        file?.let {
            it.parentFile?.mkdirs()

            val partial = File(it.path + ".partial")

            partial.writeBytes(bytes)
            partial.renameTo(it)
        }

        return image
    }

    /** The size alone, read from the header without decoding pixels; null for data that is not an image. */
    private fun header(bytes: ByteArray): KuitoImageBytes? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }

        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)

        return if (bounds.outWidth > 0 && bounds.outHeight > 0) KuitoImageBytes(bytes, bounds.outWidth, bounds.outHeight) else null
    }

    /** inSampleSize makes the decoder skip pixels, so the full image is never in memory. */
    private fun decode(image: KuitoImageBytes, sample: Int): KuitoLoadedImage = traced("Kuito image decode") {
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        val bitmap = BitmapFactory.decodeByteArray(image.bytes, 0, image.bytes.size, options) ?: throw IOException("The data is not an image")

        KuitoLoadedImage(bitmap, image.width, image.height, sample)
    }

    private fun sha256(text: String) =
        MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).joinToString("") { "%02x".format(it) }
}
