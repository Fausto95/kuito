package dev.kuito.runtime.modules.backgroundtasks

import android.app.job.JobParameters
import android.app.job.JobService

/**
 * The job JobScheduler starts for a background task (docs/background-tasks.md),
 * in the app's process, with or without its activity. Declared by the app's
 * generated manifest (src/cli/shells.ts) only when it has tasks.
 */
class KuitoBackgroundTaskService : JobService() {
    /** Run ids by job id, for [onStopJob]. */
    private val runs = mutableMapOf<Int, String>()

    override fun onStartJob(params: JobParameters): Boolean {
        val name = params.extras.getString(KuitoBackgroundTasks.EXTRA_NAME) ?: return false

        runs[params.jobId] = KuitoBackgroundTasks.launched(name) {
            runs.remove(params.jobId)
            // A periodic job runs again next period; a failed run is not retried sooner.
            jobFinished(params, false)
        }

        return true
    }

    // Constraints lost or time up: ask for the run again.
    override fun onStopJob(params: JobParameters): Boolean {
        runs.remove(params.jobId)?.let(KuitoBackgroundTasks::stopped)

        return true
    }
}
