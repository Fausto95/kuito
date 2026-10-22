// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/android/src/main/java/com/swmansion/gesturehandler/react/RNGestureHandlerRegistry.kt
// and .../core/GestureHandlerRegistry.kt),
// MIT License, Copyright (c) 2016 Software Mansion.
package dev.kuito.runtime.renderer.gestures

import android.util.SparseArray
import android.view.View

/**
 * Every gesture handler in the app by tag, the view each is attached to, and
 * the shared table of their relations and states. Tags are unique in the
 * app; the root's own handler uses a negative tag. Closing frees the table.
 * UI thread only.
 */
internal class GestureHandlerRegistry : AutoCloseable {
    private val handlers = SparseArray<GestureHandler>()
    private val attachedTo = SparseArray<View>()
    private val handlersForView = HashMap<View, ArrayList<GestureHandler>>()
    val table = GestureTable()
    val relations get() = table.relations

    /** True when an app gesture exists: the root intercepts touches only then. */
    val hasAppHandlers: Boolean
        get() = handlers.size() > 0 && handlers.keyAt(handlers.size() - 1) >= 0

    fun registerHandler(handler: GestureHandler) {
        handler.table = table
        handlers.put(handler.tag, handler)
    }

    fun getHandler(handlerTag: Int): GestureHandler? = handlers[handlerTag]

    fun attachHandlerToView(handlerTag: Int, view: View): Boolean {
        val handler = handlers[handlerTag]
        return handler?.let {
            detachHandlerInternal(handler)
            registerHandlerForView(view, handler)
            true
        } ?: false
    }

    private fun registerHandlerForView(view: View, handler: GestureHandler) {
        check(attachedTo[handler.tag] == null) { "Handler $handler already attached" }
        attachedTo.put(handler.tag, view)
        handlersForView.getOrPut(view) { ArrayList(1) }.add(handler)
    }

    private fun detachHandlerInternal(handler: GestureHandler) {
        val attachedToView = attachedTo[handler.tag]
        if (attachedToView != null) {
            attachedTo.remove(handler.tag)
            val attachedHandlers = handlersForView[attachedToView]
            if (attachedHandlers != null) {
                attachedHandlers.remove(handler)

                if (attachedHandlers.size == 0) {
                    handlersForView.remove(attachedToView)
                }
            }
        }
        if (handler.view != null) {
            // Handler is in "prepared" state which means it is registered in the orchestrator and can
            // receive touch events. This means that before we remove it from the registry we need to
            // "cancel" it so that orchestrator does no longer keep a reference to it.
            handler.cancel()
        }
    }

    fun dropHandler(handlerTag: Int) {
        handlers[handlerTag]?.let {
            detachHandlerInternal(it)
            handlers.remove(handlerTag)
            table.drop(handlerTag)
        }
    }

    /** A view left the tree: its gestures go with it. */
    fun dropHandlersForView(view: View) {
        handlersForView[view]?.toList()?.forEach { dropHandler(it.tag) }
    }

    /** Drops the app's gestures; the root's own handler stays. */
    fun dropAllHandlers() {
        for (i in handlers.size() - 1 downTo 0) {
            if (handlers.keyAt(i) >= 0) dropHandler(handlers.keyAt(i))
        }
    }

    fun getHandlersForView(view: View): ArrayList<GestureHandler>? = handlersForView[view]

    override fun close() = table.close()
}
