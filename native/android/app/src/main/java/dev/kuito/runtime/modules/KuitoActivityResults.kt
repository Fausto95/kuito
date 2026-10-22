package dev.kuito.runtime.modules

import android.app.Activity
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContract

/**
 * The one way a module starts another activity for its result: a system
 * picker, the camera, a permission prompt. Each launch registers a one-shot
 * callback with the host activity's result registry and unregisters it once
 * the result arrives, so no module overrides `onActivityResult` or keeps
 * launchers of its own.
 *
 *     KuitoActivityResults.launch(context.activity, ActivityResultContracts.TakePicture(), uri) { saved -> … }
 *
 * Call on the main thread; `done` runs there too. The shell keeps its
 * activity through configuration changes, so a result survives rotation. If
 * the system kills the app while the other activity is up, the result is
 * lost with the JavaScript that waited for it.
 */
object KuitoActivityResults {
    private var launches = 0

    fun <I, O> launch(activity: Activity, contract: ActivityResultContract<I, O>, input: I, done: (O) -> Unit) {
        val registry = (activity as? ComponentActivity)?.activityResultRegistry
            ?: throw KuitoModuleError(KuitoErrorCode.NO_ACTIVITY, "Starting an activity for its result needs a ComponentActivity")
        var launcher: ActivityResultLauncher<I>? = null

        launcher = registry.register("kuito.result.${launches++}", contract) { output ->
            launcher?.unregister()
            done(output)
        }
        try {
            launcher.launch(input)
        } catch (error: RuntimeException) {
            // No activity answers the intent: nothing will call back.
            launcher.unregister()
            throw error
        }
    }
}
