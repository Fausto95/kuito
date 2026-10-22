package dev.kuito.runtime

import android.content.Context
import android.util.Log
import dev.kuito.link.KuitoLink
import dev.kuito.runtime.link.KuitoLinker

/**
 * The runtime a background task runs in when no runtime is listening for runs:
 * Android started the process for the job, or the activity is gone
 * (docs/background-tasks.md). The kernel loads headless, so the app's modules
 * run and define their tasks but its UI does not mount. Modules get no
 * activity. The module whose runs it takes stops it once the last run ends.
 * Main thread only.
 */
object KuitoHeadlessRuntime {
    private var current: KuitoNativeRuntime? = null

    /** Why the runtime could not start, for what waits on it to give up. */
    var failed: ((String) -> Unit)? = null

    fun start(context: Context) {
        if (current != null) return

        val app = context.applicationContext

        Log.i("Kuito", "Starting a headless runtime for background tasks")

        try {
            val runtime = KuitoNativeRuntime(
                // A headless kernel mounts nothing; there is no view tree to apply a batch to.
                onMutation = { _, _ -> },
                onError = { failed("Hermes failed: $it") },
                onScriptError = { url, message, _ -> failed("$url threw: $message") },
                onLog = { level, message, _ -> Log.println(if (level == "error" || level == "warn") Log.WARN else Log.INFO, "Kuito", "[$level] $message") },
                linker = KuitoLinker(app, null, KuitoLink::function, KuitoLink::observer),
                chunks = { KuitoAppBundle.chunk(app, it) },
            )

            current = runtime
            runtime.run("globalThis.__kuitoHostHeadless = true;".encodeToByteArray(), "kuito://headless")
            runtime.run(KuitoAppBundle.read(app, "bootstrap.hbc"), "kuito://bootstrap")
            runtime.run(KuitoAppBundle.read(app, "app.hbc"), "kuito://app")
        } catch (error: Exception) {
            failed("Hermes failed to start: ${error.message}")
        }
    }

    /** Nothing can run the waiting tasks: end them now instead of at their deadline. */
    private fun failed(what: String) {
        Log.e("Kuito", "Headless runtime: $what")
        failed?.invoke("failed: the headless runtime did not start ($what)")
        stop()
    }

    /** Nothing is left to run; none is running is fine. */
    fun stop() {
        current?.close()
        current = null
    }
}
