// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/android/src/main/java/com/swmansion/gesturehandler/react/RNGestureHandlerRootHelper.kt
// and .../react/RNGestureHandlerRootView.kt),
// MIT License, Copyright (c) 2016 Software Mansion.
package dev.kuito.runtime.renderer.gestures

import android.view.MotionEvent
import android.view.ViewGroup

/**
 * Runs the orchestrator at Kuito's root view. It sees every touch before the
 * views do; once a gesture activates, the root intercepts the rest of the
 * stream and cancels the touch handling of the views under the pointers
 * (Pressable, ScrollView). With no gesture in the app, touches go straight to
 * the views.
 */
internal class GestureHandlerRootHelper(private val wrapperView: ViewGroup, private val registry: GestureHandlerRegistry) {
    private val orchestrator = GestureHandlerOrchestrator(wrapperView, registry).apply {
        minimumAlphaForTraversal = MIN_ALPHA_FOR_TOUCH
    }
    private val rootViewGestureHandler = RootViewGestureHandler(handlerTag = nextRootTag--)
    private var enabled = false
    private var shouldIntercept = false
    private var wasIntercepting = false
    private var passingTouch = false
    private var released = false

    init {
        registry.registerHandler(rootViewGestureHandler)
        registry.attachHandlerToView(rootViewGestureHandler.tag, wrapperView)
    }

    inner class RootViewGestureHandler(handlerTag: Int) : GestureHandler() {
        init {
            this.tag = handlerTag
        }

        private fun handleEvent(event: MotionEvent) {
            val currentState = state

            // we shouldn't stop intercepting events when there is an active handler already, which could happen when
            // adding a new pointer to the screen after a handler activates
            if (currentState == STATE_UNDETERMINED &&
                (!shouldIntercept || !this@GestureHandlerRootHelper.orchestrator.isAnyHandlerActive())
            ) {
                begin()
                shouldIntercept = false
            }

            if (event.actionMasked == MotionEvent.ACTION_UP) {
                end()
            }
        }

        override fun onHandle(event: MotionEvent, sourceEvent: MotionEvent) = handleEvent(event)

        override fun onCancel() {
            shouldIntercept = true
            // An app gesture activated: the views around this root (a sheet's
            // drag behavior) must not take the stream from it now.
            wrapperView.parent?.requestDisallowInterceptTouchEvent(true)
        }
    }

    /**
     * The root's own handler and its arbiter go: a sheet's root, when the
     * sheet does, or the app's when the renderer closes. Touches that still
     * reach it, while a sheet animates away, go straight to the views.
     */
    fun release() {
        if (released) return
        released = true
        registry.dropHandler(rootViewGestureHandler.tag)
        orchestrator.close()
    }

    fun requestDisallowInterceptTouchEvent() {
        // If this method gets called it means that some native view is attempting to grab lock for
        // touch event delivery. In that case we cancel all gesture recognizers
        if (enabled && !passingTouch && !released) {
            // if we are in the process of delivering touch events via GH orchestrator, we don't want to
            // treat it as a native gesture capturing the lock
            orchestrator.cancelAppHandlers()
        }
    }

    /** The root view's dispatchTouchEvent; [dispatchToViews] is the framework's own dispatch. */
    fun dispatchTouchEvent(event: MotionEvent, dispatchToViews: (MotionEvent) -> Boolean): Boolean {
        // Decided once per stream, so a stream never switches between the two paths.
        if (event.actionMasked == MotionEvent.ACTION_DOWN) {
            enabled = registry.hasAppHandlers && !released
        }

        if (!enabled) {
            return dispatchToViews(event)
        }

        // When starting a new event stream, dispatch CANCEL event so the subtree
        // can clean up its internal state that may be stale due to Gesture Handler
        // starting to intercept events mid-stream.
        if (event.actionMasked == MotionEvent.ACTION_DOWN) {
            val cancelEvent = MotionEvent.obtain(event).apply { action = MotionEvent.ACTION_CANCEL }
            dispatchToViews(cancelEvent)
            cancelEvent.recycle()
        }

        // We mark `passingTouch` before we get into `orchestrator.onTouchEvent` so that we can tell
        // if `requestDisallow` has been called as a result of a normal gesture handling process or
        // as a result of one of the gesture handlers activating
        passingTouch = true
        orchestrator.onTouchEvent(event)
        passingTouch = false

        // On the transition into interception, cancel the native views the pointers landed on - the
        // framework's ACTION_CANCEL never reaches them since the root stops dispatching to them
        if (shouldIntercept && !wasIntercepting) {
            orchestrator.cancelTouchesInInterceptedViews(event)
        }
        wasIntercepting = shouldIntercept

        if (shouldIntercept) {
            return true
        }

        dispatchToViews(event)

        // The root keeps the whole stream, as React Native's root view does: a
        // gesture on a view that consumes no touches still gets the moves.
        return true
    }

    private companion object {
        // Same threshold as UIKit hit testing on iOS.
        const val MIN_ALPHA_FOR_TOUCH = 0.01f

        // Root handlers use negative tags, one per root; app gestures never do.
        var nextRootTag = -1
    }
}
