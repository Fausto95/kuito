package dev.kuito.runtime.renderer.properties

import dev.kuito.runtime.renderer.KuitoPropValues
import dev.kuito.runtime.renderer.views.KuitoSafeAreaLayout

/** SafeAreaView's edges: a list of `top`, `right`, `bottom`, `left`. */
internal object KuitoSafeAreaProperties {
    val setters: Map<String, KuitoPropertySetter> = mapOf(
        "edges" to on<KuitoSafeAreaLayout> { context, view, value ->
            view.edges = KuitoPropValues.edges(context.record(value)).map { it.wire }.toSet()
        },
    )
}
