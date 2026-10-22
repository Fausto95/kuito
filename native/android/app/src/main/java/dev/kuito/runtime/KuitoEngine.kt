package dev.kuito.runtime

import android.app.Activity
import android.os.SystemClock
import dev.kuito.link.KuitoLink
import dev.kuito.runtime.link.KuitoLinker
import dev.kuito.runtime.shell.KuitoSplash
import dev.kuito.runtime.renderer.KuitoAndroidRenderer
import dev.kuito.runtime.renderer.KuitoEventRecord

/**
 * Hermes on the device: the kernel, then the app (bundled, or a source in
 * its place), its mutations applied to [renderer]. Failures go to
 * [onFailure], as what failed, the cause, a JavaScript stack and whether it
 * is fatal.
 */
class KuitoEngine(
    private val activity: Activity,
    private val renderer: KuitoAndroidRenderer,
    /** Debug builds: the inspector's handle (docs/devtools.md); 0 for none. */
    private val inspector: Long,
    private val onLog: (level: String, message: String, stack: String) -> Unit,
    private val onFailure: (what: String, cause: String?, stack: String, fatal: Boolean) -> Unit,
) {
    private var runtime: KuitoNativeRuntime? = null

    val hasPendingFrames get() = runtime?.hasPendingFrames == true

    /** Whether a runtime started: a Live Patch has nothing to run in otherwise. */
    val isRunning get() = runtime != null

    /**
     * Starts Hermes with the bundled app, or with [source] in its place. The
     * bundled scripts keep their names across starts, so a debugger's
     * breakpoints carry over (docs/devtools.md).
     */
    fun start(source: String? = null) {
        try {
            val started = pipeline()

            runtime = started
            started.run(KuitoAppBundle.read(activity, "bootstrap.hbc"), "kuito://bootstrap")
            started.run(source?.encodeToByteArray() ?: KuitoAppBundle.read(activity, "app.hbc"), "kuito://app")
        } catch (error: Exception) {
            onFailure("Hermes failed to start", error.message, "", true)
        }
    }

    /** A file of the bundled app, under `assets/kuito/`. */
    fun asset(name: String) = activity.assets.open("kuito/$name").use { it.readBytes() }

    /** Development builds: the app's recording so far (docs/devtools.md#recording-and-replay). */
    fun recording(done: (recording: ByteArray?, error: String?) -> Unit) =
        runtime?.recording(done) ?: done(null, "No app is running")

    private fun pipeline() =
        KuitoNativeRuntime(
            onMutation = { batch, index ->
                try {
                    renderer.apply(batch, index)
                } catch (error: Exception) {
                    onFailure("Rendering a mutation of view ${batch.ids[index]} failed", error.message, "", false)
                }
            },
            onError = { error -> onFailure("Hermes failed", error, "", false) },
            onScriptError = ::scriptFailed,
            onLog = onLog,
            linker = KuitoLinker(activity, activity, KuitoLink::function, KuitoLink::observer),
            onDrivenProp = { batch, index ->
                try {
                    renderer.applyDriven(batch, index)
                } catch (error: Exception) {
                    onFailure("UI thread ${batch.propName(index)} of view ${batch.ids[index]} failed", error.message, "", false)
                }
            },
            onFramesCommitted = KuitoSplash::framesCommitted,
            inspector = inspector,
            chunks = { KuitoAppBundle.chunk(activity, it) },
            uiKernel = { KuitoAppBundle.uiKernel(activity) },
            uiBundle = { KuitoAppBundle.uiBundle(activity) },
            refreshRate = { activity.window.decorView.display?.refreshRate ?: 0f },
        )

    /**
     * Runs a Live Patch. Evaluation runs on the JS thread; [done] gets its
     * error, or null, and how long it took. A script that throws also
     * reaches [onFailure].
     */
    fun patch(source: String, revision: Int, done: (error: String?, milliseconds: Double) -> Unit) {
        val running = runtime ?: return
        val started = SystemClock.elapsedRealtimeNanos()

        running.run(source.encodeToByteArray(), "kuito://patch/$revision") { error ->
            done(error, (SystemClock.elapsedRealtimeNanos() - started) / 1_000_000.0)
        }
    }

    /**
     * A native event: the view's number (0 for the app), the event, its
     * payload's record. True when the UI thread's kernel took it.
     */
    internal fun event(id: Int, event: String, record: KuitoEventRecord): Boolean =
        try {
            runtime?.event(id, event, record) ?: false
        } catch (error: Exception) {
            onFailure("Event $event of view $id failed", error.message, "", false)
            false
        }

    fun close() {
        runtime?.close()
        runtime = null
    }

    /** A script passed to the runtime threw; code that fails to run is fatal. */
    private fun scriptFailed(url: String, message: String, stack: String) {
        val what = when {
            url == "kuito://bootstrap" -> "The Kuito kernel failed to start"
            url.startsWith("kuito://patch/") -> "Live Patch ${url.substringAfterLast('/')} threw; the previous version stays live"
            else -> "Your app threw while starting"
        }

        onFailure(what, message, stack, true)
    }
}
