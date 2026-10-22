package dev.kuito.runtime

import android.net.Uri
import android.os.SystemClock
import java.io.File
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okio.Buffer
import okio.BufferedSink
import okio.ForwardingSink
import okio.buffer
import okio.sink
import okio.source

/**
 * The HTTP host on Android (native/shared/Http.h): OkHttp, each body read off
 * its BufferedSource on OkHttp's thread, buffered whole, passed on chunk by
 * chunk once the kernel streams it, or written to a file. File bodies stream
 * from disk. The sink gets a head, chunks, progress when asked, then an end,
 * in order, for every request not cancelled.
 */
internal class KuitoHttpClient(private val sink: Sink) {
    interface Sink {
        fun head(id: Int, status: Int, url: String, headers: Array<String>)
        fun chunk(id: Int, data: ByteArray)
        /** `total` is -1 when unknown. */
        fun progress(id: Int, bytes: Long, total: Long)
        fun end(id: Int, body: ByteArray, error: String)
    }

    /** Where a body comes from and goes, besides the request itself. */
    class Files(
        /** Sent after the request's body and before [suffix]. */
        val bodyFile: File?,
        val suffix: ByteArray,
        /** The body is written here, replacing it, when the status is 2xx. */
        val saveTo: File?,
        val progress: Int,
    )

    /** One body on its way; [buffer] and [streaming] change under its lock. */
    private class Transfer(val call: Call, val files: Files) {
        val buffer = Buffer()
        var streaming = false
        var reportedAt = 0L
    }

    private val client = OkHttpClient()
    private val transfers = ConcurrentHashMap<Int, Transfer>()

    fun start(id: Int, url: String, method: String, headers: Array<String>, body: ByteArray, files: Files) {
        val builder = Request.Builder().url(url)
        for (at in 0 until headers.size - 1 step 2) builder.addHeader(headers[at], headers[at + 1])
        val payload = when {
            files.bodyFile != null -> FileBody(id, body, files.bodyFile, files.suffix, files.progress == SEND)
            // OkHttp wants no body on GET and HEAD and one, even empty, on POST, PUT and PATCH.
            body.isNotEmpty() || method in BODY_METHODS -> body.toRequestBody(null)
            else -> null
        }
        val call = client.newCall(builder.method(method, payload).build())
        val transfer = Transfer(call, files)
        transfers[id] = transfer
        call.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (transfers.remove(id) != null) sink.end(id, ByteArray(0), e.message ?: "The request failed")
            }

            override fun onResponse(call: Call, response: Response) = response.use { read(id, transfer, it) }
        })
    }

    fun stream(id: Int) {
        val transfer = transfers[id] ?: return
        if (transfer.files.saveTo != null) return
        synchronized(transfer) {
            if (transfer.streaming) return
            transfer.streaming = true
            if (transfer.buffer.size > 0) sink.chunk(id, transfer.buffer.readByteArray())
        }
    }

    fun cancel(id: Int) {
        transfers.remove(id)?.call?.cancel()
    }

    fun close() {
        for (transfer in transfers.values) transfer.call.cancel()
        transfers.clear()
        client.dispatcher.executorService.shutdown()
    }

    /** Progress at most every [PROGRESS_INTERVAL_MS], and always at the last byte. */
    private fun report(id: Int, transfer: Transfer?, bytes: Long, total: Long, last: Boolean = false) {
        transfer ?: return
        val now = SystemClock.uptimeMillis()
        if (!last && !(total >= 0 && bytes >= total) && now - transfer.reportedAt < PROGRESS_INTERVAL_MS) return
        transfer.reportedAt = now
        sink.progress(id, bytes, total)
    }

    private fun read(id: Int, transfer: Transfer, response: Response) {
        if (transfers[id] !== transfer) return
        val flat = ArrayList<String>(response.headers.size * 2)
        for ((name, value) in response.headers) {
            flat.add(name)
            flat.add(value)
        }
        sink.head(id, response.code, response.request.url.toString(), flat.toTypedArray())
        val body = response.body
        val total = body?.contentLength() ?: -1L
        val saveTo = transfer.files.saveTo?.takeIf { response.isSuccessful }
        // Beside the destination, so the final move is a rename on the same volume.
        val staged = saveTo?.let { File(it.parentFile, ".kuito-${System.nanoTime()}-${it.name}") }
        val receiving = transfer.files.progress == RECEIVE
        var received = 0L
        try {
            val source = body?.source()
            if (staged != null) {
                staged.sink().buffer().use { file ->
                    while (source != null) {
                        val read = source.read(file.buffer, CHUNK_BYTES)
                        if (read == -1L) break
                        file.emitCompleteSegments()
                        received += read
                        if (receiving) report(id, transfers[id], received, total)
                    }
                }
            } else {
                val incoming = Buffer()
                while (source != null && source.read(incoming, CHUNK_BYTES) != -1L) {
                    received += incoming.size
                    synchronized(transfer) {
                        // A download's body that isn't 2xx is dropped: nothing is written for it.
                        if (transfer.files.saveTo != null) incoming.clear() else transfer.buffer.writeAll(incoming)
                        if (transfer.streaming) sink.chunk(id, transfer.buffer.readByteArray())
                    }
                    if (receiving) report(id, transfers[id], received, total)
                }
            }
            if (saveTo != null && staged != null) {
                saveTo.delete()
                if (!staged.renameTo(saveTo)) throw IOException("Could not move the download to ${saveTo.path}")
            }
        } catch (e: IOException) {
            staged?.delete()
            if (transfers.remove(id) != null) sink.end(id, ByteArray(0), e.message ?: "The response failed")
            return
        }
        if (receiving) report(id, transfers[id], received, total, last = true)
        if (transfers.remove(id) == null) return
        synchronized(transfer) { sink.end(id, transfer.buffer.readByteArray(), "") }
    }

    /** `prefix`, the file, then `suffix`, streamed from disk; counts what it sent when asked. */
    private inner class FileBody(
        private val id: Int,
        private val prefix: ByteArray,
        private val file: File,
        private val suffix: ByteArray,
        private val reporting: Boolean,
    ) : RequestBody() {
        override fun contentType(): MediaType? = null

        override fun contentLength() = prefix.size + file.length() + suffix.size

        override fun writeTo(sink: BufferedSink) {
            val total = contentLength()
            var sent = 0L
            val counted = if (!reporting) sink else object : ForwardingSink(sink) {
                override fun write(source: Buffer, byteCount: Long) {
                    super.write(source, byteCount)
                    sent += byteCount
                    report(id, transfers[id], sent, total)
                }
            }.buffer()
            counted.write(prefix)
            file.source().use { counted.writeAll(it) }
            counted.write(suffix)
            counted.flush()
        }
    }

    companion object {
        /** [Files.progress]: none, the bytes sent, or the bytes received (native/shared/Http.h). */
        const val SEND = 1
        const val RECEIVE = 2

        private val BODY_METHODS = setOf("POST", "PUT", "PATCH")
        private const val CHUNK_BYTES = 64L * 1024
        private const val PROGRESS_INTERVAL_MS = 100L

        /** A file URI FileSystem's sandbox resolved (src/native/file-system.ts); null when empty. */
        fun file(uri: String): File? {
            if (uri.isEmpty()) return null
            val parsed = Uri.parse(uri)
            val path = parsed.path
            require(parsed.scheme == "file" && !path.isNullOrEmpty()) { "A transfer's file is a file:// URI, not $uri" }
            return File(path)
        }
    }
}
