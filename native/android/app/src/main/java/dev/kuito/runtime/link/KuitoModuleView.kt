package dev.kuito.runtime.link

import android.content.Context
import android.view.View
import dev.kuito.runtime.modules.KuitoErrorCode
import dev.kuito.runtime.modules.KuitoModuleError
import dev.kuito.runtime.modules.KuitoViewDefinition
import dev.kuito.runtime.modules.KuitoViewEvents
import dev.kuito.runtime.renderer.KuitoModuleViewKind
import dev.kuito.runtime.renderer.KuitoModuleViews

/**
 * The view a linked module contributes (docs/native-modules.md#views): how to
 * make it and its props by name. The link table registers its kind with the
 * renderer the first time the kernel plans one.
 */
class KuitoModuleView<V : View> @PublishedApi internal constructor(
    private val make: (Context, KuitoViewEvents) -> V,
    private val definition: KuitoViewDefinition<V>,
) {
    /** The kind the renderer makes, with the events the spec declares. */
    internal fun kind(events: List<String>): KuitoModuleViewKind {
        val declared = events.toSet()

        return KuitoModuleViewKind(
            { context, id, emitter ->
                make(context, KuitoViewEvents(id, emitter, declared)).also { KuitoModuleViews.mount(id, it) }
            },
            definition.props,
        )
    }

    companion object {
        inline operator fun <reified V : View> invoke(
            noinline make: (Context, KuitoViewEvents) -> V,
            define: (KuitoViewDefinition<V>) -> Unit,
        ) = KuitoModuleView(make, KuitoViewDefinition(V::class.java).also(define))
    }
}

/** Registers a linked view's kind; the generated link table calls it. */
fun KuitoModuleView<*>.register(name: String, events: List<String>) =
    KuitoModuleViews.register("module:$name", kind(events))

/** The mounted view a view method's first argument names. UI thread. */
fun linkedView(id: Double): View =
    KuitoModuleViews.view(id.toInt()) ?: throw KuitoModuleError(KuitoErrorCode.VIEW_NOT_FOUND, "No view $id is mounted")
