package dev.kuito.runtime.modules.backgroundtasks

import android.app.Application
import dev.kuito.link.BackgroundTaskDelivery
import dev.kuito.link.BackgroundTaskSchedule
import dev.kuito.link.BackgroundTasksSpec
import dev.kuito.runtime.KuitoHeadlessRuntime
import dev.kuito.runtime.link.KuitoEmitter
import dev.kuito.runtime.modules.KuitoModuleContext

/**
 * `BackgroundTasks` in native/modules/background-tasks/background-tasks.ts;
 * the kernel's half is src/runtime/background-tasks.ts, which listens for
 * `run` and calls `finish`.
 */
class KuitoBackgroundTasksModule(private val context: KuitoModuleContext) : BackgroundTasksSpec {
    private var cancel: (() -> Unit)? = null

    companion object {
        // A run that arrives with no runtime listening starts a headless one, which stops once idle.
        fun launch(application: Application) {
            KuitoHeadlessRuntime.failed = KuitoBackgroundTasks::abandonWaiting
            KuitoBackgroundTasks.onIdle = KuitoHeadlessRuntime::stop
            KuitoBackgroundTasks.startRuntime = { KuitoHeadlessRuntime.start(application) }
        }
    }

    override fun register(name: String, schedule: BackgroundTaskSchedule) = KuitoBackgroundTasks.register(
        context.applicationContext,
        name,
        KuitoBackgroundTasks.Options(schedule.minimumInterval, schedule.requiresNetwork, schedule.requiresCharging),
    )

    override fun unregister(name: String) = KuitoBackgroundTasks.unregister(context.applicationContext, name)

    override fun status() = KuitoBackgroundTasks.status(context.applicationContext)

    override fun finish(id: String, succeeded: Boolean) {
        KuitoBackgroundTasks.finish(id, succeeded)
    }

    override fun startRun(emitter: KuitoEmitter<BackgroundTaskDelivery>) {
        cancel = KuitoBackgroundTasks.observe { run ->
            emitter.send(
                BackgroundTaskDelivery(
                    id = run.getValue("id") as String,
                    name = run.getValue("name") as String,
                    deadline = run.getValue("deadline") as Double,
                    data = run["data"],
                ),
            )
        }
    }

    override fun stopRun() {
        cancel?.invoke()
        cancel = null
    }
}
