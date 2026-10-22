package dev.kuito.runtime.devtools

import android.content.Context
import java.util.UUID

/**
 * Everything the devtools show and toggle, observed by the sheet, the
 * performance monitor and the update highlighter. One instance per shell.
 */
class KuitoDevtools(context: Context, url: String) {
    data class Patch(val revision: Int, val milliseconds: Double, val at: Long)

    private val preferences = context.getSharedPreferences("kuito.devtools", Context.MODE_PRIVATE)
    private val observers = linkedMapOf<UUID, () -> Unit>()

    var url = url
        set(value) {
            field = value
            changed()
        }

    var connection: ConnectionState = ConnectionState.Connecting
        set(value) {
            field = value
            changed()
        }

    var patches: List<Patch> = emptyList()
        private set

    var lastError: String? = null
        private set

    var showsPerformance = preferences.getBoolean("performance", false)
        set(value) {
            field = value
            preferences.edit().putBoolean("performance", value).apply()
            changed()
        }

    var highlightsUpdates = preferences.getBoolean("highlights", false)
        set(value) {
            field = value
            preferences.edit().putBoolean("highlights", value).apply()
            changed()
        }

    /** The corner the performance monitor rests in: 0 top-left … 3 bottom-right. */
    var monitorCorner: Int
        get() = preferences.getInt("monitor.corner", 3)
        set(value) = preferences.edit().putInt("monitor.corner", value).apply()

    /** Actions the shell performs; set by the activity. */
    var reconnect: () -> Unit = {}
    var reload: () -> Unit = {}

    fun patched(revision: Int, milliseconds: Double) {
        patches = (listOf(Patch(revision, milliseconds, System.currentTimeMillis())) + patches).take(20)
        lastError = null
        changed()
    }

    fun failed(message: String) {
        lastError = message
        changed()
    }

    fun clearError() {
        lastError = null
        changed()
    }

    fun observe(observer: () -> Unit): UUID {
        val id = UUID.randomUUID()

        observers[id] = observer
        observer()

        return id
    }

    fun unobserve(id: UUID) {
        observers.remove(id)
    }

    private fun changed() = observers.values.toList().forEach { it() }
}
