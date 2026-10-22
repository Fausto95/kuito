package dev.kuito.runtime.shell

import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Whether the app is in the foreground, and memory warnings. The shell
 * observes its activity's lifecycle with this and reports memory pressure;
 * `AppState` reads and observes them here. [state] is read from any thread,
 * since `AppState.currentState` answers on the JS thread. It outlives
 * runtimes, so a reload starts with the current state.
 */
object KuitoAppLifecycle : LifecycleEventObserver {
    enum class State(val wire: String) { ACTIVE("active"), BACKGROUND("background"), INACTIVE("inactive") }

    sealed interface Event {
        data class Changed(val state: State) : Event
        data object MemoryWarning : Event
    }

    /** Paused but visible (another activity partly covers this one) is inactive, as between iOS's foreground and background. */
    private val states = mapOf(
        Lifecycle.Event.ON_START to State.INACTIVE,
        Lifecycle.Event.ON_RESUME to State.ACTIVE,
        Lifecycle.Event.ON_PAUSE to State.INACTIVE,
        Lifecycle.Event.ON_STOP to State.BACKGROUND,
    )

    @Volatile
    var state = State.INACTIVE
        private set

    private val observers = CopyOnWriteArrayList<(Event) -> Unit>()

    override fun onStateChanged(source: LifecycleOwner, event: Lifecycle.Event) {
        val next = states[event] ?: return

        if (next == state) return

        state = next
        notify(Event.Changed(next))
    }

    fun receivedMemoryWarning() = notify(Event.MemoryWarning)

    /** Calls [observer] with each change until the returned function is called. */
    fun observe(observer: (Event) -> Unit): () -> Unit {
        observers.add(observer)

        return { observers.remove(observer) }
    }

    private fun notify(event: Event) = observers.forEach { it(event) }
}
