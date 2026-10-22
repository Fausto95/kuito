package dev.kuito.runtime

import android.app.Application
import dev.kuito.link.KuitoLink

/**
 * The app's process. A background task or a location task may be why it
 * started, with no activity: their runs start a headless runtime when no
 * runtime is listening (docs/background-tasks.md). The included modules
 * that ask for it run first (docs/native-modules.md#launch).
 */
class KuitoApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        KuitoLink.launch(this)
    }
}
