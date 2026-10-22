package dev.kuito.runtime.renderer

import android.os.Looper
import android.widget.CompoundButton
import org.json.JSONArray
import org.json.JSONObject

/**
 * Native events in Kuito's wire format (docs/events.md): the view's number
 * (0 for the app), the event, and its payload written into a record in the
 * layout src/protocol/manifest.ts declares (docs/events.md#typed-events). A
 * module view's own events, which the manifest does not lay out, carry JSON.
 */
internal class KuitoEventEmitter(private var send: ((Int, String, KuitoEventRecord) -> Boolean)?) {
    private val record = KuitoEventRecord()

    /**
     * An event sent while another is being sent, by a view its handler changed,
     * or off the main thread, gets a record of its own.
     */
    private var sending = false

    /**
     * [payload] is the generated type the manifest names for the view's kind
     * and [event]; null for none. True when a UI-thread handler took it: what
     * it changed is applied already.
     */
    fun emit(id: Int, event: String, payload: KuitoEventPayload? = null): Boolean =
        deliver(id, event) { record -> if (payload != null) payload.write(record) else record.begin(0) }

    /**
     * A module view's event: JSON, every number JSON cannot hold sent as null.
     * One without a payload is JSON too, empty: the manifest has no layout for it.
     */
    fun emitJson(id: Int, event: String, payload: Map<String, Any?>?) {
        if (payload == null) {
            deliver(id, event) { it.json("") }

            return
        }

        val text = json(payload).toString()

        deliver(id, event) { it.json(text) }
    }

    /** Sends nothing from now on. */
    fun detach() {
        send = null
    }

    fun switchChanged(id: Int) = CompoundButton.OnCheckedChangeListener { _, checked ->
        emit(id, "change", KuitoValuePayload(value = checked))
    }

    private inline fun deliver(id: Int, event: String, write: (KuitoEventRecord) -> Unit): Boolean {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            val own = KuitoEventRecord()

            write(own)

            return send?.invoke(id, event, own) ?: false
        }

        val nested = sending
        val target = if (nested) KuitoEventRecord() else record

        write(target)
        sending = true
        try {
            return send?.invoke(id, event, target) ?: false
        } finally {
            sending = nested
        }
    }

    /**
     * `value` as JSON, every number JSON cannot hold as null, as iOS sends it.
     * JSONObject's own toString() turns a NaN anywhere into a null payload.
     */
    private fun json(value: Any?): Any = when (value) {
        null -> JSONObject.NULL
        is Double -> if (value.isFinite()) value else JSONObject.NULL
        is Float -> if (value.isFinite()) value else JSONObject.NULL
        is Number, is Boolean, is String -> value
        is Map<*, *> -> JSONObject().apply { value.forEach { (key, item) -> put(key.toString(), json(item)) } }
        is List<*> -> JSONArray().apply { value.forEach { put(json(it)) } }
        else -> throw IllegalArgumentException("An event payload holds ${value::class.java.name}, which JSON cannot")
    }
}
