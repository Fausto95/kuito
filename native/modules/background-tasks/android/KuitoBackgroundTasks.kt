package dev.kuito.runtime.modules.backgroundtasks

import android.app.ActivityManager
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PersistableBundle
import android.util.Log
import dev.kuito.link.BackgroundTaskStatus
import dev.kuito.runtime.modules.KuitoModuleError
import java.util.UUID

/**
 * Between JobScheduler and the runtimes that run tasks
 * (docs/background-tasks.md). The shell's job service reports each job it
 * starts; it becomes a run, delivered to the latest runtime listening for
 * runs, or held until one starts. A run ends when JavaScript finishes it,
 * Android stops it, or its deadline passes, and only then is the job
 * finished. Main thread only. It outlives runtimes, so a reload or a
 * headless runtime stopping never loses a job Android is waiting on.
 */
object KuitoBackgroundTasks {
    class Options(val minimumInterval: Double, val requiresNetwork: Boolean, val requiresCharging: Boolean)

    /** A run per delivery (a location task's fixes) is [quiet]: it logs only when it fails. */
    private class Running(val name: String, val finished: (Boolean) -> Unit, val timeout: Runnable, val quiet: Boolean)

    /** What the job service reads to know which task a job runs. */
    const val EXTRA_NAME = "dev.kuito.backgroundTask"

    /** The shell's JobService; src/cli/shells.ts declares it when the app has tasks. */
    private const val SERVICE = "dev.kuito.runtime.modules.backgroundtasks.KuitoBackgroundTaskService"
    private const val DECLARED = "dev.kuito.backgroundTasks"

    /** JobScheduler stops a job after 10 minutes; runs end a little before. */
    private const val BUDGET_MS = 9 * 60_000L

    private val main = Handler(Looper.getMainLooper())
    private val running = mutableMapOf<String, Running>()
    /** Runs no runtime took yet. */
    private val waiting = mutableListOf<Map<String, Any?>>()
    private val observers = mutableListOf<(Map<String, Any?>) -> Unit>()
    /**
     * Sources whose runs come every few seconds (location tasks): a runtime
     * started for runs stays up between them while one is held.
     */
    private val holds = mutableSetOf<String>()

    /**
     * Starts a runtime when a run arrives and none is listening. The shell's
     * application sets it as the process starts, whatever started it.
     */
    var startRuntime: () -> Unit = {}

    /** Called when the last run ended and nothing is held, so a runtime started for runs can stop. */
    var onIdle: (() -> Unit)? = null

    /**
     * A job's id: stable across launches, so registering again replaces the
     * job, and never negative, which `adb shell cmd jobscheduler run` would
     * read as an option.
     */
    fun jobId(name: String) = name.hashCode() and Int.MAX_VALUE

    // Registration

    fun register(context: Context, name: String, options: Options) {
        if (name !in declared(context)) throw KuitoModuleError(
            "ERR_UNDECLARED",
            "Background task '$name' is not declared. Add it to backgroundTasks in kuito.config.ts and rebuild the app.")

        val job = JobInfo.Builder(jobId(name), ComponentName(context, SERVICE))
            .setPeriodic((options.minimumInterval * 60_000).toLong())
            .setRequiredNetworkType(if (options.requiresNetwork) JobInfo.NETWORK_TYPE_ANY else JobInfo.NETWORK_TYPE_NONE)
            .setRequiresCharging(options.requiresCharging)
            .setPersisted(true)
            .setExtras(PersistableBundle().apply { putString(EXTRA_NAME, name) })
            .build()

        if (scheduler(context).schedule(job) != JobScheduler.RESULT_SUCCESS)
            throw KuitoModuleError("ERR_SCHEDULE", "Android did not schedule '$name'")

        Log.i("Kuito", "Background task '$name' is job ${jobId(name)}. To run it now: " +
            "adb shell cmd jobscheduler run -f ${context.packageName} ${jobId(name)}")
    }

    fun unregister(context: Context, name: String) = scheduler(context).cancel(jobId(name))

    /** Android has no switch for background work as a whole; the user can restrict an app's. */
    fun status(context: Context) =
        if (Build.VERSION.SDK_INT >= 28 && context.getSystemService(ActivityManager::class.java).isBackgroundRestricted)
            BackgroundTaskStatus.RESTRICTED else BackgroundTaskStatus.AVAILABLE

    private fun scheduler(context: Context) = context.getSystemService(JobScheduler::class.java)

    private fun declared(context: Context): List<String> =
        context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
            .metaData?.getString(DECLARED)?.split(',').orEmpty()

    // Runs

    /** A job started: [finished] tells JobScheduler how it went. Returns the run's id. */
    fun launched(name: String, finished: (Boolean) -> Unit): String = start(name, BUDGET_MS, null, finished)

    /** A run of [name] with [data], for a source of the app's own: a location task's fixes. */
    fun deliver(name: String, data: Map<String, Any?>, budgetMs: Long) {
        start(name, budgetMs, data) {}
    }

    fun hold(source: String) {
        holds.add(source)
    }

    fun release(source: String) {
        if (holds.remove(source) && running.isEmpty() && holds.isEmpty()) onIdle?.invoke()
    }

    private fun start(name: String, budgetMs: Long, data: Map<String, Any?>?, finished: (Boolean) -> Unit): String {
        val id = UUID.randomUUID().toString()
        val run = mapOf("id" to id, "name" to name, "deadline" to (System.currentTimeMillis() + budgetMs).toDouble())
            .plus(if (data == null) emptyMap() else mapOf("data" to data))
        val timeout = Runnable { finish(id, false, "ran past its deadline") }

        running[id] = Running(name, finished, timeout, quiet = data != null)
        main.postDelayed(timeout, budgetMs)

        // The latest: the app's UI, opened while a headless runtime still runs location tasks.
        val observer = observers.lastOrNull()

        if (observer != null) observer(run) else {
            waiting.add(run)
            startRuntime()
        }

        return id
    }

    /** Ends a run and finishes its job. A run already ended is ignored. */
    fun finish(id: String, succeeded: Boolean, reason: String? = null) = end(id, succeeded, reason)?.finished?.invoke(succeeded)

    /** Android stopped the job: it needs no finishing. */
    fun stopped(id: String) {
        end(id, false, "was stopped by Android")
    }

    private fun end(id: String, succeeded: Boolean, reason: String?): Running? {
        val run = running.remove(id) ?: return null

        main.removeCallbacks(run.timeout)
        waiting.removeAll { it["id"] == id }
        if (!(succeeded && run.quiet)) Log.i("Kuito", "Background task '${run.name}' ${reason ?: if (succeeded) "succeeded" else "failed"}")

        if (running.isEmpty() && holds.isEmpty()) onIdle?.invoke()

        return run
    }

    /** Ends every run no runtime took: the runtime started for them failed. */
    fun abandonWaiting(reason: String) {
        waiting.map { it["id"] as String }.forEach { finish(it, false, reason) }
    }

    /** Delivers runs to [deliver] until the returned function is called, starting with those waiting. */
    fun observe(deliver: (Map<String, Any?>) -> Unit): () -> Unit {
        observers.add(deliver)
        waiting.forEach(deliver)
        waiting.clear()

        return { observers.remove(deliver) }
    }
}
