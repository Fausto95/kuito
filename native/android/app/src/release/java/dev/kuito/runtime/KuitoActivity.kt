package dev.kuito.runtime

import android.os.Bundle
import android.util.Log
import android.view.View
import dev.kuito.runtime.shell.KuitoSplash
import java.util.concurrent.Executors

/**
 * The release shell: the app alone. It holds no dev link, devtools or
 * LogBox, so nothing in it reaches a dev server; console output and
 * failures go to logcat, and errors and crashes to [KuitoCrashReports]
 * (docs/crash-reports.md). It runs the over-the-air update it staged, if
 * any, and looks for a newer one once the app drew (docs/updates.md).
 */
class KuitoActivity : KuitoHostActivity() {
    private var hasFirstFrame = false

    override fun onCreate(savedInstanceState: Bundle?) {
        KuitoCrashReports.install(applicationContext)
        // Once per process: an activity recreated later runs what the first one chose.
        if (KuitoUpdates.shared == null) KuitoUpdates.bundled(applicationContext)?.let(::launch)
        super.onCreate(savedInstanceState)
    }

    private fun launch(updates: KuitoUpdates) {
        KuitoUpdates.shared = updates

        updates.launch()?.let { running ->
            KuitoAppBundle.update = updates.bundle
            KuitoCrashReports.update = running.id
            Log.i("Kuito", "Running the update ${running.id}")
        }

        KuitoCrashReports.onFatal = updates::crashed
    }

    override fun rendered(view: View) {
        if (hasFirstFrame) return

        hasFirstFrame = true
        KuitoSplash.firstFrame()

        val updates = KuitoUpdates.shared ?: return

        checks.execute {
            updates.drew()

            try {
                updates.check()?.let { Log.i("Kuito", "Staged the update ${it.id} for the next start") }
            } catch (refused: KuitoUpdateError) {
                Log.w("Kuito", "Refused an update: ${refused.message}")
            } catch (error: Exception) {
                Log.w("Kuito", "Could not check for an update: ${error.message}")
            }
        }
    }

    /** An error the app logged or threw outside a caller: event handlers, timers, rejections. */
    override fun log(level: String, message: String, stack: String) {
        Log.println(if (level == "log" || level == "info" || level == "debug") Log.INFO else Log.WARN, "Kuito", "[$level] $message")

        if (level == "error") KuitoCrashReports.record("javascript", false, message, stack)
    }

    companion object {
        /** Update checks, off the main thread: one at a time. */
        private val checks = Executors.newSingleThreadExecutor()
    }

    /** A script that failed to run is fatal; a failure without a JavaScript stack is the shell's own. */
    override fun failed(what: String, cause: String?, stack: String, fatal: Boolean) {
        val message = cause?.let { "$it\n$what" } ?: what

        Log.e("Kuito", listOfNotNull(message, stack.ifEmpty { null }).joinToString("\n"))
        KuitoCrashReports.record(if (stack.isEmpty()) "native" else "javascript", fatal, message, stack)

        // Code that failed to run leaves nothing to hand off to.
        if (fatal) KuitoSplash.dismiss()
    }
}
