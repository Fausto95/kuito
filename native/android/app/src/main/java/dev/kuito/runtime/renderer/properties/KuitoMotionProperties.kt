package dev.kuito.runtime.renderer.properties

import dev.kuito.runtime.renderer.views.KuitoMotionSource

/** Motion sources: whether a view sends where it moves, every frame (docs/motion.md#motion-sources). */
internal object KuitoMotionProperties {
    val setters: Map<String, KuitoPropertySetter> = mapOf(
        "emitsMotion" to on<KuitoMotionSource> { context, view, value -> view.sendsMotion = context.flag(value) },
    )
}
