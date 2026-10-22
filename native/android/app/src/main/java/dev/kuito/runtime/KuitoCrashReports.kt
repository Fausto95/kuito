package dev.kuito.runtime

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.RequiresApi
import org.json.JSONObject
import java.io.File
import java.time.Instant
import java.util.UUID

/**
 * What a hosted crash service's adapter implements: an ordinary native
 * module that adds itself to [KuitoCrashReports] when the app starts it
 * (docs/crash-reports.md). Called on the main thread, once per report.
 */
fun interface KuitoCrashReporter {
    fun report(report: KuitoCrashReport)
}

/**
 * A crash or JavaScript error of a release shell, as it is stored and handed
 * on. `kuito symbolicate` reads the same JSON (src/cli/crash-reports.ts).
 */
data class KuitoCrashReport(
    val id: String,
    /** `javascript` or `native`. */
    val kind: String,
    /** Whether the app stopped: a native crash, or a script that failed to run. */
    val fatal: Boolean,
    val message: String,
    val stack: String,
    /** ISO 8601. */
    val time: String,
    val appId: String,
    val version: String,
    val build: String,
    /** The over-the-air update it ran (docs/updates.md); null for the bytecode it shipped with. */
    val update: String?,
    val os: String,
    val device: String,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("kind", kind)
        .put("fatal", fatal)
        .put("message", message)
        .put("stack", stack)
        .put("time", time)
        .put("app", JSONObject().put("id", appId).put("version", version).put("build", build).put("update", update))
        .put("platform", "android")
        .put("os", os)
        .put("device", device)

    companion object {
        fun of(json: JSONObject): KuitoCrashReport {
            val app = json.getJSONObject("app")

            return KuitoCrashReport(
                json.getString("id"), json.getString("kind"), json.getBoolean("fatal"), json.getString("message"),
                json.getString("stack"), json.getString("time"), app.getString("id"), app.getString("version"),
                app.getString("build"), app.optString("update").ifEmpty { null }, json.getString("os"), json.getString("device"),
            )
        }
    }
}

/**
 * The release shell's crash and JavaScript-error hook (docs/crash-reports.md).
 * A report is written to the app's files before anything else, so one the
 * process does not survive reaches the adapters at the next launch; it is
 * removed once an adapter has it. Uncaught Kotlin and Java exceptions are
 * written as the process dies; native crashes and ANRs come from the
 * system's exit reasons at the next launch (Android 11 and later).
 */
object KuitoCrashReports {
    /** The newest reports kept while no adapter takes them. */
    private const val KEPT = 20
    /** The most of an ANR's thread dump a report carries. */
    private const val TRACE_BYTES = 64 * 1024
    private val main = Handler(Looper.getMainLooper())
    /** A non-fatal report is written here, off the thread that hit it. */
    private val writes = java.util.concurrent.Executors.newSingleThreadExecutor()
    /** The last non-fatal error, so one thrown every frame is kept once; [writes] only. */
    private var lastError: String? = null
    /** Main thread only. */
    private val reporters = mutableListOf<KuitoCrashReporter>()
    private var directory: File? = null
    private var app = Triple("", "", "")
    /** The update this process runs, set once at launch before the app starts. */
    @Volatile
    var update: String? = null
    /** A fatal crash of this process, as it is recorded: the updates count it against what ran. */
    @Volatile
    var onFatal: (() -> Unit)? = null

    /** Once, at launch: the release shell's activity calls it. */
    @Synchronized
    fun install(context: Context) {
        if (directory != null) return

        directory = File(context.filesDir, "kuito/crash-reports").apply { mkdirs() }

        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        val build = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()

        app = Triple(context.packageName, info.versionName ?: "", build.toString())

        val previous = Thread.getDefaultUncaughtExceptionHandler()

        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            record("native", true, error.toString(), error.stackTraceToString())
            previous?.uncaughtException(thread, error)
        }

        if (Build.VERSION.SDK_INT >= 30) Thread { recordExits(context) }.start()
        main.post(::deliver)
    }

    /** Adds an adapter: it gets the reports still waiting, then each new one. Main thread. */
    fun add(reporter: KuitoCrashReporter) {
        if (reporter in reporters) return

        reporters += reporter
        deliver()
    }

    fun remove(reporter: KuitoCrashReporter) {
        reporters -= reporter
    }

    /**
     * Writes a report now, from any thread, and hands it on from the main
     * thread. `past` is a crash of an earlier run, which the system reports now.
     */
    fun record(kind: String, fatal: Boolean, message: String, stack: String, time: Long = System.currentTimeMillis(), past: Boolean = false) {
        val (appId, version, build) = app
        val report = KuitoCrashReport(
            UUID.randomUUID().toString(), kind, fatal, message, stack, Instant.ofEpochMilli(time).toString(),
            appId, version, build, if (past) null else update, Build.VERSION.RELEASE, "${Build.MANUFACTURER} ${Build.MODEL}",
        )

        // A fatal report is written before the process ends; it is delivered at the next launch.
        if (fatal) {
            write(report, time)
            if (!past) onFatal?.invoke()
            return
        }

        writes.execute {
            val key = "$message\n$stack"

            if (key == lastError) return@execute
            lastError = key
            write(report, time)
            main.post(::deliver)
        }
    }

    @Synchronized
    private fun write(report: KuitoCrashReport, time: Long) {
        val directory = directory ?: return

        try {
            // Named by time, so the oldest sort first; `f` marks a fatal one, kept over the others.
            val name = String.format(java.util.Locale.ROOT, "%013d-%s-%s.json", time, if (report.fatal) "f" else "n", report.id)
            val partial = File(directory, "$name.partial")

            // Whole or not at all: the process may end mid-write.
            partial.writeText(report.toJson().toString())
            partial.renameTo(File(directory, name))

            val files = pending()
            val stale = files.filter { "-n-" in it.name } + files.filter { "-f-" in it.name }

            stale.take(maxOf(files.size - KEPT, 0)).forEach { it.delete() }
        } catch (error: Exception) {
            Log.w("Kuito", "Could not keep a crash report: ${error.message}")
        }
    }

    @Synchronized
    private fun pending(): List<File> =
        directory?.listFiles { file -> file.extension == "json" }?.sortedBy { it.name } ?: emptyList()

    /**
     * Every waiting report to every adapter, oldest first. Each is removed
     * before it is handed on, and an adapter that throws is skipped, so a
     * bad adapter cannot turn one report into a crash at every launch.
     */
    private fun deliver() {
        if (reporters.isEmpty()) return

        for (file in pending()) {
            val report = runCatching { KuitoCrashReport.of(JSONObject(file.readText())) }.getOrNull()

            file.delete()

            if (report != null)
                for (reporter in reporters.toList())
                    try {
                        reporter.report(report)
                    } catch (error: Exception) {
                        Log.w("Kuito", "A crash reporter failed: ${error.message}")
                    }
        }
    }

    /** At most [TRACE_BYTES] of [stream], as text. */
    private fun head(stream: java.io.InputStream): String {
        val buffer = ByteArray(TRACE_BYTES)
        var read = 0

        while (read < buffer.size) {
            val count = stream.read(buffer, read, buffer.size - read)

            if (count < 0) break
            read += count
        }

        return String(buffer, 0, read)
    }

    /**
     * The native crashes and ANRs that ended runs since the last launch looked;
     * a Kotlin or Java crash was written as it happened.
     */
    @RequiresApi(30)
    private fun recordExits(context: Context) {
        val seen = context.getSharedPreferences("kuito.crash-reports", Context.MODE_PRIVATE)
        val since = seen.getLong("exitsSeen", 0L)
        val exits = context.getSystemService(ActivityManager::class.java)
            ?.getHistoricalProcessExitReasons(null, 0, 16)
            .orEmpty()
            .filter { it.timestamp > since }

        for (exit in exits.sortedBy { it.timestamp }) {
            val message = when (exit.reason) {
                ApplicationExitInfo.REASON_CRASH_NATIVE -> "Native crash"
                ApplicationExitInfo.REASON_ANR -> "Application not responding"
                else -> continue
            }
            // An ANR's thread dump is text; a native crash's tombstone is not.
            val trace = if (exit.reason == ApplicationExitInfo.REASON_ANR)
                runCatching { exit.traceInputStream?.use(::head) }.getOrNull()
            else null

            record("native", true, listOfNotNull(message, exit.description).joinToString(": "), trace ?: "", exit.timestamp, past = true)
        }

        exits.maxOfOrNull { it.timestamp }?.let { seen.edit().putLong("exitsSeen", it).commit() }
    }
}
