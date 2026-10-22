package dev.kuito.runtime.logbox

import org.json.JSONObject
import java.util.UUID

/**
 * Warnings and errors the app produced, grouped: a repeat of the same entry
 * counts up instead of piling on. The dev server fills in source frames.
 * Main thread only.
 */
class KuitoLogBox {
    /** What the LogBox shows; console `log`, `info` and `debug` only print. */
    enum class Level { WARN, ERROR, FATAL;
        val wire get() = name.lowercase()

        companion object {
            fun of(level: String) = values().firstOrNull { it.wire == level }
        }
    }

    data class Frame(val name: String, val kind: String, val file: String?, val line: Int?, val column: Int?) {
        val location get() = file?.let { if (line != null) "$it:$line" else it }
    }

    data class CodeFrame(val file: String, val line: Int, val column: Int, val text: String)

    data class Entry(
        val id: String,
        val level: Level,
        val message: String,
        val stack: String,
        val count: Int = 1,
        val at: Long = System.currentTimeMillis(),
        /** Empty until the dev server answers. */
        val frames: List<Frame> = emptyList(),
        val codeFrame: CodeFrame? = null,
    ) {
        val title get() = message.substringBefore('\n')

        /** The stack's frame lines, for when no dev server can symbolicate. */
        val rawFrames get() = stack.lines().map(String::trim).filter { it.startsWith("at ") }
    }

    var entries: List<Entry> = emptyList()
        private set

    private var serial = 0
    private val observers = mutableMapOf<UUID, () -> Unit>()

    /** Records a console entry or failure; returns the entry it shows, if any. */
    fun record(level: String, message: String, stack: String): Entry? {
        val shown = Level.of(level) ?: return null
        val repeat = entries.firstOrNull { it.level == shown && it.message == message }

        if (repeat != null) {
            entries = entries - repeat + repeat.copy(count = repeat.count + 1, at = System.currentTimeMillis())
            changed()

            return null
        }

        val entry = Entry((++serial).toString(), shown, message, stack)

        entries = entries + entry
        changed()

        return entry
    }

    /** The dev server's answer to an entry: frames and a code frame. */
    fun symbolicated(message: JSONObject) {
        val id = message.optString("id")
        val frames = message.optJSONArray("frames")
        val parsed = (0 until (frames?.length() ?: 0)).map { index ->
            val frame = frames!!.getJSONObject(index)

            Frame(
                frame.optString("name"),
                frame.optString("kind", "app"),
                frame.optString("file").ifEmpty { null },
                frame.optInt("line").takeIf { frame.has("line") },
                frame.optInt("column").takeIf { frame.has("column") },
            )
        }
        val code = message.optJSONObject("codeFrame")?.let {
            CodeFrame(it.getString("file"), it.getInt("line"), it.optInt("column", 1), it.getString("frame"))
        }

        entries = entries.map { if (it.id == id) it.copy(frames = parsed, codeFrame = code) else it }
        changed()
    }

    fun dismiss(id: String) {
        entries = entries.filterNot { it.id == id }
        changed()
    }

    /** A Live Patch that applies replaces the code a fatal error came from. */
    fun clearFatal() {
        if (entries.none { it.level == Level.FATAL }) return

        entries = entries.filterNot { it.level == Level.FATAL }
        changed()
    }

    fun clear() {
        entries = emptyList()
        changed()
    }

    fun count(level: Level) = entries
        .filter { it.level == level || (level == Level.ERROR && it.level == Level.FATAL) }
        .sumOf { it.count }

    /** The entry as text, for pasting into an issue or a chat. */
    fun report(entry: Entry): String {
        val lines = mutableListOf("${entry.level.wire.replaceFirstChar(Char::uppercase)}: ${entry.message}")

        entry.codeFrame?.let { lines += listOf("", "${it.file}:${it.line}:${it.column}", it.text) }

        val frames = if (entry.frames.isEmpty()) entry.rawFrames
            else entry.frames.map { frame ->
                listOfNotNull("at", frame.name.ifEmpty { "<anonymous>" }, frame.location?.let { "($it)" }).joinToString(" ")
            }

        if (frames.isNotEmpty()) lines += listOf("") + frames

        return lines.joinToString("\n")
    }

    fun observe(observer: () -> Unit): UUID {
        val id = UUID.randomUUID()

        observers[id] = observer
        observer()

        return id
    }

    fun unobserve(id: UUID) {
        observers.remove(id)
    }

    private fun changed() {
        for (observer in observers.values.toList()) observer()
    }
}
