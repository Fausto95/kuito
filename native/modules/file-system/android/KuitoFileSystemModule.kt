package dev.kuito.runtime.modules.filesystem

import android.net.Uri
import dev.kuito.link.FileAccess
import dev.kuito.link.FileDirectories
import dev.kuito.link.FileByteRange
import dev.kuito.link.FileBytesWrite
import dev.kuito.link.FileStat
import dev.kuito.link.FileSystemSpec
import dev.kuito.link.FileTextWrite
import dev.kuito.runtime.modules.KuitoModuleContext
import dev.kuito.runtime.modules.KuitoModuleError
import dev.kuito.runtime.modules.filesystem.KuitoSandbox.Entry
import java.io.File
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.io.InputStream
import java.io.RandomAccessFile
import java.nio.Buffer
import java.nio.ByteBuffer

/**
 * `FileSystem` in native/modules/file-system/file-system.ts. File work runs
 * on the module's background thread; downloads and uploads stream on the
 * HTTP host (native/shared/Http.h), to and from the files `sandboxed` resolves.
 */
class KuitoFileSystemModule(private val context: KuitoModuleContext) : FileSystemSpec {
    private val sandbox by lazy { KuitoSandbox(context.applicationContext) }
    private val assets get() = context.applicationContext.assets

    override fun directories() = FileDirectories(
        document = KuitoSandbox.uri(sandbox.document),
        cache = KuitoSandbox.uri(sandbox.cache),
        bundle = KuitoSandbox.BUNDLE,
    )

    override fun getInfo(uri: String): FileStat = info(uri)

    override fun readText(uri: String): String = utf8(open(uri).use { it.readBytes() }, uri)

    // A direct buffer the ArrayBuffer shares: a file on disk reads straight into it.
    override fun readBytes(request: FileByteRange): ByteBuffer = range(request.uri, request.position?.toLong() ?: 0L, request.length?.toInt())

    override fun writeText(request: FileTextWrite) =
        write(ByteBuffer.wrap(request.contents.toByteArray()), request.uri, request.append)

    override fun writeBytes(request: FileBytesWrite) = write(request.contents.duplicate(), request.uri, request.append)

    private fun write(bytes: ByteBuffer, uri: String, append: Boolean) {
        val file = sandbox.write(uri)

        parent(file, uri)

        val drain = { target: File ->
            FileOutputStream(target, append).channel.use { channel -> while (bytes.hasRemaining()) channel.write(bytes) }
        }

        if (append) drain(file) else atomically(file, drain)
    }

    override fun makeDirectory(uri: String, intermediates: Boolean) {
        val file = sandbox.write(uri)

        if (file.exists()) throw KuitoModuleError("ERR_EXISTS", "Something already exists at $uri")
        if (!intermediates) parent(file, uri)
        if (!(if (intermediates) file.mkdirs() else file.mkdir()))
            throw KuitoModuleError("ERR_NATIVE", "Could not create the directory $uri")
    }

    override fun delete(uri: String, idempotent: Boolean) {
        val file = sandbox.write(uri)

        if (!file.exists()) {
            if (!idempotent) notFound(uri)
        } else if (!file.deleteRecursively()) {
            throw KuitoModuleError("ERR_NATIVE", "Could not delete everything at $uri")
        }
    }

    override fun move(from: String, to: String) {
        val source = sandbox.write(from).also { if (!it.exists()) notFound(from) }
        val target = sandbox.write(to)

        parent(target, to)
        target.deleteRecursively()

        if (!source.renameTo(target)) {
            source.copyRecursively(target, overwrite = true)
            source.deleteRecursively()
        }
    }

    override fun copy(from: String, to: String) {
        val target = sandbox.write(to)

        parent(target, to)

        when (val source = sandbox.read(from)) {
            is Entry.Disk -> {
                if (!source.file.exists()) notFound(from)
                atomically(target) { source.file.copyRecursively(it, overwrite = true) }
            }
            is Entry.Asset -> atomically(target) { file ->
                open(from).use { input -> file.outputStream().use { input.copyTo(it) } }
            }
        }
    }

    override fun readDirectory(uri: String): List<String> = when (val entry = sandbox.read(uri)) {
        is Entry.Disk -> entry.file.list()?.sorted() ?: notFound(uri)
        is Entry.Asset -> assets.list(entry.path)?.sorted().orEmpty()
    }

    // Where the HTTP host streams a transfer: a file to read that exists,
    // or one to write whose directory does.
    override fun sandboxed(uri: String, access: FileAccess): String {
        val file = when (access) {
            FileAccess.READ -> when (val entry = sandbox.read(uri)) {
                is Entry.Disk -> entry.file.takeIf { it.isFile } ?: notFound(uri)
                is Entry.Asset -> throw KuitoModuleError("ERR_SANDBOX", "Copy $uri out of the bundle to upload it")
            }
            FileAccess.WRITE -> sandbox.write(uri).also { parent(it, uri) }
        }

        return Uri.fromFile(file).toString()
    }

    private fun info(uri: String): FileStat = when (val entry = sandbox.read(uri)) {
        is Entry.Disk -> {
            val file = entry.file

            if (!file.exists()) FileStat(exists = false, uri = uri)
            else FileStat(
                exists = true,
                uri = KuitoSandbox.uri(file),
                isDirectory = file.isDirectory,
                // A directory's size is its files'.
                size = file.walkTopDown().filter { it.isFile }.sumOf { it.length() }.toDouble(),
                modificationTime = file.lastModified() / 1000.0,
            )
        }
        is Entry.Asset -> {
            val children = assets.list(entry.path).orEmpty()
            val size = if (children.isEmpty()) assetSize(entry.path) else null

            if (children.isEmpty() && size == null) FileStat(exists = false, uri = uri)
            else FileStat(
                exists = true,
                uri = uri,
                isDirectory = children.isNotEmpty(),
                size = (size ?: 0L).toDouble(),
                modificationTime = 0.0,
            )
        }
    }

    /** Null when nothing is there; -1 bytes when the asset is compressed and its size unknown. */
    private fun assetSize(path: String): Long? = try {
        assets.openFd(path).use { it.length }
    } catch (error: FileNotFoundException) {
        // Compressed assets have no descriptor; opening them still proves they exist.
        try {
            assets.open(path).use { -1L }
        } catch (missing: FileNotFoundException) {
            null
        }
    }

    private fun open(uri: String): InputStream = when (val entry = sandbox.read(uri)) {
        is Entry.Disk -> entry.file.takeIf { it.isFile }?.inputStream() ?: notFound(uri)
        is Entry.Asset -> try {
            assets.open(entry.path)
        } catch (error: FileNotFoundException) {
            notFound(uri)
        }
    }

    private fun range(uri: String, position: Long, length: Int?): ByteBuffer {
        val entry = sandbox.read(uri)

        if (entry is Entry.Disk) {
            if (!entry.file.isFile) notFound(uri)

            return RandomAccessFile(entry.file, "r").use { file ->
                val count = minOf(length?.toLong() ?: Long.MAX_VALUE, maxOf(0, file.length() - position))

                if (count > Int.MAX_VALUE)
                    throw KuitoModuleError("ERR_ARGUMENT", "readBytes reads at most 2 GB at once: read $uri in ranges")

                val bytes = ByteBuffer.allocateDirect(count.toInt())

                while (bytes.hasRemaining() && file.channel.read(bytes, position + bytes.position()) >= 0) Unit
                bytes.also { (it as Buffer).flip() }
            }
        }

        val bytes = open(uri).use { input ->
            input.skip(position)
            if (length == null) input.readBytes() else input.readNBytesCompat(length)
        }

        return ByteBuffer.allocateDirect(bytes.size).put(bytes).also { (it as Buffer).flip() }
    }

    private fun InputStream.readNBytesCompat(count: Int): ByteArray {
        val bytes = ByteArray(count)
        var read = 0

        while (read < count) {
            val chunk = read(bytes, read, count - read)
            if (chunk < 0) break
            read += chunk
        }

        return bytes.copyOf(read)
    }

    private fun utf8(bytes: ByteArray, uri: String): String {
        val decoder = Charsets.UTF_8.newDecoder()

        return try {
            decoder.decode(java.nio.ByteBuffer.wrap(bytes)).toString()
        } catch (error: java.nio.charset.CharacterCodingException) {
            throw KuitoModuleError("ERR_ENCODING", "$uri is not UTF-8; read it with readBytes")
        }
    }

    private fun parent(file: File, uri: String) {
        if (file.parentFile?.isDirectory != true)
            throw KuitoModuleError("ERR_NOT_FOUND", "The directory $uri would be in doesn't exist")
    }

    private fun notFound(uri: String): Nothing = throw KuitoModuleError("ERR_NOT_FOUND", "Nothing exists at $uri")
}
