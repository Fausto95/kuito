package dev.kuito.runtime.modules

import android.app.Activity
import android.content.Context

/** An error a module throws or rejects with; JavaScript sees `code` and `message`. */
class KuitoModuleError(val code: String, override val message: String) : Exception(message)

/** What a linked module is made with: its name, and the app and activity it runs in. */
class KuitoModuleContext(
    val name: String,
    /** The application: what a module that needs no activity uses, so it also runs in background tasks. */
    val applicationContext: Context,
    private val hostActivity: Activity?,
) {
    /** The host activity. A background task's runtime has none (docs/background-tasks.md). */
    val activity: Activity
        get() = hostActivity ?: throw KuitoModuleError(
            KuitoErrorCode.NO_ACTIVITY, "$name needs the app's activity, and background tasks run without one")
}
