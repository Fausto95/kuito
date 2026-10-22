package dev.kuito.runtime.renderer.properties

import android.content.Context
import dev.kuito.runtime.renderer.KuitoGestureTypeValue
import dev.kuito.runtime.renderer.KuitoPropValues
import dev.kuito.runtime.renderer.KuitoRenderError
import dev.kuito.runtime.renderer.KuitoValue
import dev.kuito.runtime.renderer.gestures.FlingGestureHandler
import dev.kuito.runtime.renderer.gestures.GestureConfig
import dev.kuito.runtime.renderer.gestures.GestureHandler
import dev.kuito.runtime.renderer.gestures.GestureHandlerEventDispatcher
import dev.kuito.runtime.renderer.gestures.LongPressGestureHandler
import dev.kuito.runtime.renderer.gestures.PanGestureHandler
import dev.kuito.runtime.renderer.gestures.PinchGestureHandler
import dev.kuito.runtime.renderer.gestures.RotationGestureHandler
import dev.kuito.runtime.renderer.gestures.TapGestureHandler

/**
 * The gestures attached to a view (docs/motion.md, "Native contract"): a list
 * of `{ tag, type, config, waitFor, simultaneousHandlers, blocksHandlers }`.
 * A new value replaces the view's set; `null` removes it.
 */
internal object KuitoGestureProperties {
    private class Kind(val type: Class<out GestureHandler>, val create: (Context) -> GestureHandler)

    private val pan = Kind(PanGestureHandler::class.java, ::PanGestureHandler)
    private val tap = Kind(TapGestureHandler::class.java) { TapGestureHandler() }
    private val longPress = Kind(LongPressGestureHandler::class.java, ::LongPressGestureHandler)
    private val pinch = Kind(PinchGestureHandler::class.java, ::PinchGestureHandler)
    private val rotation = Kind(RotationGestureHandler::class.java) { RotationGestureHandler() }
    private val fling = Kind(FlingGestureHandler::class.java) { FlingGestureHandler() }

    private fun kind(type: KuitoGestureTypeValue): Kind = when (type) {
        KuitoGestureTypeValue.PAN -> pan
        KuitoGestureTypeValue.TAP -> tap
        KuitoGestureTypeValue.LONG_PRESS -> longPress
        KuitoGestureTypeValue.PINCH -> pinch
        KuitoGestureTypeValue.ROTATION -> rotation
        KuitoGestureTypeValue.FLING -> fling
    }

    private class Spec(
        val tag: Int,
        val kind: Kind,
        val config: GestureConfig,
        val waitFor: IntArray,
        val simultaneousHandlers: IntArray,
        val blocksHandlers: IntArray,
    )

    val setters: Map<String, KuitoPropertySetter> = mapOf("gestures" to ::setGestures)

    private fun setGestures(context: KuitoPropertyContext, value: KuitoValue) {
        val registry = context.gestures
        val view = context.view
        val specs = if (value == KuitoValue.Null) emptyList() else KuitoPropValues.gestures(context.record(value)).mapIndexed { index, spec ->
            Spec(
                tag = tag(spec.tag) ?: throw KuitoRenderError.Rejection("gestures[$index] needs an integer tag"),
                kind = kind(spec.type),
                config = GestureConfig(spec.config.orEmpty(), context.density),
                waitFor = tags(spec.waitFor, "waitFor"),
                simultaneousHandlers = tags(spec.simultaneousHandlers, "simultaneousHandlers"),
                blocksHandlers = tags(spec.blocksHandlers, "blocksHandlers"),
            )
        }
        val tags = specs.map { it.tag }.toSet()

        if (tags.size != specs.size) throw KuitoRenderError.Rejection("gestures repeat a tag")

        registry.getHandlersForView(view)?.filter { it.tag !in tags }?.forEach { registry.dropHandler(it.tag) }

        for (spec in specs) {
            val existing = registry.getHandler(spec.tag)
            val handler = existing?.takeIf(spec.kind.type::isInstance) ?: spec.kind.create(view.context).also {
                existing?.let { registry.dropHandler(it.tag) }
                it.tag = spec.tag
                registry.registerHandler(it)
            }

            handler.onTouchEventListener = GestureHandlerEventDispatcher(context.density) { payload ->
                context.events.emit(context.id, "gesture", payload)
            }
            handler.setConfig(spec.config)
            registry.relations.set(handler.tag, spec.waitFor, spec.simultaneousHandlers, spec.blocksHandlers)

            // Re-attaching would cancel a gesture in progress: only a new or moved gesture attaches.
            if (registry.getHandlersForView(view)?.contains(handler) != true) registry.attachHandlerToView(handler.tag, view)
        }
    }

    /** Gesture tags are non-negative integers; the root's own handler uses negative ones. */
    private fun tag(value: Int): Int? = value.takeIf { it >= 0 }

    private fun tags(values: List<Int>?, key: String): IntArray =
        values.orEmpty().map { tag(it) ?: throw KuitoRenderError.Rejection("$key must be an array of tags") }.toIntArray()
}
