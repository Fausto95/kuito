package dev.kuito.runtime.modules.appstate

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import dev.kuito.link.AppState
import dev.kuito.link.AppStateSpec
import dev.kuito.runtime.link.KuitoEmitter
import dev.kuito.runtime.link.KuitoPromise
import dev.kuito.runtime.link.KuitoSignal
import dev.kuito.runtime.link.resolve
import dev.kuito.runtime.link.send
import dev.kuito.runtime.modules.KuitoModuleContext
import dev.kuito.runtime.shell.KuitoAppLifecycle

/** `AppState` in native/modules/app-state/app-state.ts. */
class KuitoAppStateModule(private val context: KuitoModuleContext) : AppStateSpec {
    private val observations = mutableMapOf<String, () -> Unit>()

    override fun state() = appState(KuitoAppLifecycle.state)

    // Starting sends the current state: JavaScript read it before this ran
    // on the UI thread, and drops it unless it changed in between.
    override fun startState(signal: KuitoSignal<AppState>) {
        observe("state") { event ->
            if (event is KuitoAppLifecycle.Event.Changed) signal.set(appState(event.state))
        }
        signal.set(state())
    }

    override fun stopState() = cancel("state")

    override fun startMemoryWarning(emitter: KuitoEmitter<Unit>) = observe("memoryWarning") { event ->
        if (event is KuitoAppLifecycle.Event.MemoryWarning) emitter.send()
    }

    override fun stopMemoryWarning() = cancel("memoryWarning")

    override fun openSettings(promise: KuitoPromise<Unit>) {
        context.activity.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.activity.packageName, null)),
        )
        promise.resolve()
    }

    private fun appState(state: KuitoAppLifecycle.State) = when (state) {
        KuitoAppLifecycle.State.ACTIVE -> AppState.ACTIVE
        KuitoAppLifecycle.State.BACKGROUND -> AppState.BACKGROUND
        KuitoAppLifecycle.State.INACTIVE -> AppState.INACTIVE
    }

    private fun observe(key: String, observer: (KuitoAppLifecycle.Event) -> Unit) {
        observations[key] = KuitoAppLifecycle.observe(observer)
    }

    private fun cancel(key: String) {
        observations.remove(key)?.invoke()
    }
}
