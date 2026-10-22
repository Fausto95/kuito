package dev.kuito.runtime.modules

import android.view.View
import dev.kuito.runtime.renderer.KuitoEventEmitter
import dev.kuito.runtime.renderer.properties.KuitoPropertySetter
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

/**
 * What a module's view implements to hear that Kuito removed it, or that the
 * runtime is reloading: [unmount] gives back what it holds outside itself (a
 * player, a camera session). The view may stay on screen a moment longer,
 * for an exit animation. UI thread.
 */
interface KuitoNativeView {
    fun unmount()
}

/**
 * A native view's way back to JavaScript: the events its spec declares,
 * in the wire format of docs/events.md. Call on the UI thread.
 */
class KuitoViewEvents internal constructor(
    private val id: Int,
    private val emitter: KuitoEventEmitter,
    private val declared: Set<String>,
) {
    /** The payload's fields arrive on the event JavaScript receives. */
    fun emit(event: String, payload: Map<String, Any?>? = null) {
        check(event in declared) { "Event $event is not declared by the view's spec" }
        emitter.emitJson(id, event, payload)
    }
}

/**
 * The props a module's view declares, by name like the renderer's tables,
 * collected by [dev.kuito.runtime.link.KuitoModuleView]:
 *
 *     KuitoModuleView(::KuitoSliderView) { view ->
 *         view.prop("value", KuitoType.optional(KuitoType.double)) { slider, value -> slider.requested = value ?: 0.0 }
 *     }
 */
class KuitoViewDefinition<V : View> @PublishedApi internal constructor(private val type: Class<V>) {
    private val propTable = mutableMapOf<String, KuitoPropertySetter>()

    internal val props: Map<String, KuitoPropertySetter> get() = propTable

    /**
     * A prop decoded by [type]. A value that doesn't decode throws
     * `unsupportedValue`, as built-in props do; use [KuitoType.optional] to accept
     * the prop's removal, which arrives as null.
     */
    fun <A> prop(name: String, type: KuitoType<A>, set: (V, A) -> Unit) {
        check(name !in propTable) { "Prop $name is defined twice" }
        propTable[name] = { context, value ->
            val view = this.type.takeIf { it.isInstance(context.view) }?.cast(context.view) ?: context.unsupportedProp()
            val decoded = try {
                decode(type, value.untyped)
            } catch (error: Exception) {
                context.unsupportedValue(value, error.message.orEmpty())
            }

            set(view, decoded)
        }
    }

    /**
     * Prop values arrive as the host sends them: a string as itself, and
     * numbers, booleans, objects and arrays as their JSON text. An object
     * or array reads as such first, so a prop that takes a string or an
     * object (WebView's `src`) gets the object.
     */
    private fun <A> decode(type: KuitoType<A>, value: Any?): A = when (value) {
        null -> type.decode(JSONObject.NULL)
        is String -> {
            val structured = runCatching { JSONTokener(value).nextValue() }.getOrNull()
                ?.takeIf { it is JSONObject || it is JSONArray }

            if (structured != null) {
                try {
                    type.decode(structured)
                } catch (error: KuitoModuleError) {
                    // JSON that is not the value says why, rather than that it is no string.
                    runCatching { type.decode(value) }.getOrElse { throw error }
                }
            } else {
                try {
                    type.decode(value)
                } catch (error: KuitoModuleError) {
                    // Text that is a JSON value (a number, a boolean) reads as one; other text says why the string is not the value.
                    type.decode(runCatching { JSONTokener(value).nextValue() }.getOrNull() ?: throw error)
                }
            }
        }
        else -> type.decode(value)
    }
}
