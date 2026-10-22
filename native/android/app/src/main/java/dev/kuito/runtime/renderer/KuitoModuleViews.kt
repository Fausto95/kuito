package dev.kuito.runtime.renderer

import android.content.Context
import android.view.View
import dev.kuito.runtime.modules.KuitoNativeView
import dev.kuito.runtime.renderer.properties.KuitoPropertySetter
import java.util.concurrent.ConcurrentHashMap

/**
 * A kind a native module contributes (docs/native-modules.md#views): how to make its
 * view, and the props it owns ahead of the shared tables.
 */
internal class KuitoModuleViewKind(
    val make: (Context, Int, KuitoEventEmitter) -> View,
    val props: Map<String, KuitoPropertySetter>,
)

/**
 * Kinds native modules contribute, by kind (`module:<Name>`). The link
 * table adds a module's view on the JS thread the first time the kernel
 * plans one, before the view's first mutation reaches the UI thread. A reloaded runtime registers its modules again.
 *
 * It also holds the module views the renderer shows, by id, for the view
 * methods JavaScript calls through a ref (docs/native-modules.md#views). Those are
 * UI-thread only.
 */
internal object KuitoModuleViews {
    private val kinds = ConcurrentHashMap<String, KuitoModuleViewKind>()
    private val mounted = mutableMapOf<Int, View>()

    fun mount(id: Int, view: View) {
        mounted[id] = view
    }

    fun unmount(id: Int) {
        (mounted.remove(id) as? KuitoNativeView)?.unmount()
    }

    fun unmountAll() {
        val views = mounted.values.toList()

        mounted.clear()
        views.forEach { (it as? KuitoNativeView)?.unmount() }
    }

    fun view(id: Int): View? = mounted[id]

    fun register(kind: String, view: KuitoModuleViewKind) {
        kinds[kind] = view
    }

    fun kind(kind: String): KuitoModuleViewKind? = kinds[kind]
}
