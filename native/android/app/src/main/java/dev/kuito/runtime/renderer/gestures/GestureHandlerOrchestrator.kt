// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/android/src/main/java/com/swmansion/gesturehandler/core/GestureHandlerOrchestrator.kt),
// MIT License, Copyright (c) 2016 Software Mansion.
package dev.kuito.runtime.renderer.gestures

import android.graphics.Matrix
import android.graphics.PointF
import android.util.SparseArray
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.EditText

/**
 * Finds the handlers under each new pointer and delivers the touch stream to
 * them. The shared arbiter (native/shared/gestures/GestureArbiter.h) decides
 * between them: activation, waiting for failure, simultaneous recognition
 * and cancelling; this answers what only the views know.
 */
internal class GestureHandlerOrchestrator(
    private val wrapperView: ViewGroup,
    private val handlerRegistry: GestureHandlerRegistry,
) : GestureArbiter.Host, AutoCloseable {
    /**
     * Minimum alpha (value from 0 to 1) that should be set to a view so that it can be treated as a
     * gesture target. E.g. if set to 0.1 then views that less than 10% opaque will be ignored when
     * traversing view hierarchy and looking for gesture handlers.
     */
    var minimumAlphaForTraversal = DEFAULT_MIN_ALPHA_FOR_TRAVERSAL
    private val arbiter = handlerRegistry.table.arbiter(this)

    /** The handlers in the arbiter's stream by tag, until it resets them. */
    private val recorded = SparseArray<GestureHandler>()

    // Used by `cancelTouchesInInterceptedViews`.
    private val viewsToCancel = arrayListOf<View>()
    private val pointerDownPoints = SparseArray<PointF>()

    /**
     * Should be called from the view wrapper
     */
    fun onTouchEvent(event: MotionEvent): Boolean {
        arbiter.beginTouch()
        try {
            val action = event.actionMasked
            trackPointerDownPoints(event)
            if (action == MotionEvent.ACTION_DOWN || action == MotionEvent.ACTION_POINTER_DOWN) {
                extractGestureHandlers(event)
            } else if (action == MotionEvent.ACTION_CANCEL) {
                arbiter.cancelAll()
            }
            deliverEventToGestureHandlers(event)
        } finally {
            arbiter.endTouch()
        }
        return true
    }

    /** The root goes: its arbiter is freed. */
    override fun close() = arbiter.close()

    private fun handler(tag: Int) = checkNotNull(recorded[tag]) { "No recorded gesture handler has tag $tag" }

    override fun sharePointers(a: Int, b: Int) = handler(a).hasCommonPointers(handler(b))

    override fun inside(gesture: Int, other: Int) = handler(gesture).isDescendantOf(handler(other))

    override fun cancelling(tag: Int) = handler(tag).onCancel()

    override fun changed(tag: Int, newState: Int, oldState: Int) = handler(tag).onStateChange(newState, oldState)

    override fun send(tag: Int, newState: Int, oldState: Int) = handler(tag).dispatchStateChange(newState, oldState)

    override fun reset(tag: Int) {
        recorded[tag]?.reset()
        recorded.remove(tag)
    }

    private fun deliverEventToGestureHandlers(event: MotionEvent) {
        // The order is a copy: the handlers in the stream can change as a result of state updates.
        for (tag in arbiter.order()) {
            recorded[tag]?.let { deliverEventToGestureHandler(it, event) }
        }
    }

    private fun deliverEventToGestureHandler(handler: GestureHandler, sourceEvent: MotionEvent) {
        if (!isViewAttachedUnderWrapper(handler.view)) {
            handler.cancel()
            return
        }

        if (!handler.wantsEvent(sourceEvent)) {
            return
        }

        val action = sourceEvent.actionMasked
        val event = transformEventToViewCoords(handler.view, MotionEvent.obtain(sourceEvent))

        if (!arbiter.awaiting(handler.tag) || action != MotionEvent.ACTION_MOVE) {
            handler.handle(event, sourceEvent)
            if (handler.state == GestureHandler.STATE_ACTIVE && arbiter.active(handler.tag)) {
                // After handler is done waiting for other one to fail its progress should be
                // reset, otherwise there may be a visible jump in values sent by the handler.
                // When handler is waiting it's already activated but the `isAwaiting` flag
                // prevents it from receiving touch stream. When the flag is changed, the
                // difference between this event and the last one may be large enough to be
                // visible in interactions based on this gesture. This makes it consistent with
                // the behavior on iOS.
                if (arbiter.takeResetProgress(handler.tag)) {
                    handler.resetProgress()
                }
                handler.dispatchHandlerUpdate(event)
            }

            // if event was of type UP or POINTER_UP we request handler to stop tracking now that
            // the event has been dispatched
            if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_POINTER_UP) {
                val pointerId = event.getPointerId(event.actionIndex)
                handler.stopTrackingPointer(pointerId)
            }
        }

        event.recycle()
    }

    /** A native view (a scroll view, a list) took the touch: the app's gestures give it up. */
    fun cancelAppHandlers() = arbiter.cancelApp()

    /**
     * isViewAttachedUnderWrapper checks whether all of parents for view related to handler
     * view are attached. Since there might be an issue rarely observed when view
     * has been detached and handler's state hasn't been change to canceled, failed or
     * ended yet. Probably it's a result of some race condition and stopping delivering
     * for this handler and changing its state to failed of end appear to be good enough solution.
     */
    private fun isViewAttachedUnderWrapper(view: View?): Boolean {
        if (view == null) {
            return false
        }
        if (view === wrapperView) {
            return true
        }
        var current: View = view
        while (true) {
            val parent = current.parent as? ViewGroup ?: return false

            when {
                // A disappearing child (kept drawable for an exit animation) still has `parent` set
                // but is gone from `mChildren`. Treat as detached - `cancelTouchTarget` already
                // synthesized ACTION_CANCEL into this subtree.
                parent.indexOfChild(current) < 0 -> return false
                parent === wrapperView -> return true
                else -> current = parent
            }
        }
    }

    fun isAnyHandlerActive() = arbiter.anyActive()

    /**
     * Transforms an event in the coordinates of wrapperView into the coordinate space of the received view.
     *
     * This modifies and returns the same event as it receives
     *
     * @param view - view to which coordinate space the event should be transformed
     * @param event - event to transform
     */
    fun transformEventToViewCoords(view: View?, event: MotionEvent): MotionEvent {
        if (view == null) {
            return event
        }

        val parent = view.parent as? ViewGroup
        // Events are passed down to the orchestrator by the wrapperView, so they are already in the
        // relevant coordinate space. We want to stop traversing the tree when we reach it.
        if (parent != wrapperView) {
            transformEventToViewCoords(parent, event)
        }

        if (parent != null) {
            val localX = event.x + parent.scrollX - view.left
            val localY = event.y + parent.scrollY - view.top
            event.setLocation(localX, localY)
        }

        if (!view.matrix.isIdentity) {
            view.matrix.invert(inverseMatrix)
            event.transform(inverseMatrix)
        }

        return event
    }

    /**
     * Transforms a point in the coordinates of wrapperView into the coordinate space of the received view.
     *
     * This modifies and returns the same point as it receives
     *
     * @param view - view to which coordinate space the point should be transformed
     * @param point - point to transform
     */
    fun transformPointToViewCoords(view: View?, point: PointF): PointF {
        if (view == null) {
            return point
        }

        val parent = view.parent as? ViewGroup
        // Events are passed down to the orchestrator by the wrapperView, so they are already in the
        // relevant coordinate space. We want to stop traversing the tree when we reach it.
        if (parent != wrapperView) {
            transformPointToViewCoords(parent, point)
        }

        if (parent != null) {
            point.x += parent.scrollX - view.left
            point.y += parent.scrollY - view.top
        }

        if (!view.matrix.isIdentity) {
            view.matrix.invert(inverseMatrix)
            tempCoords[0] = point.x
            tempCoords[1] = point.y
            inverseMatrix.mapPoints(tempCoords)
            point.x = tempCoords[0]
            point.y = tempCoords[1]
        }

        return point
    }

    private fun recordHandlerIfNotPresent(handler: GestureHandler, view: View?) {
        if (arbiter.recorded(handler.tag)) {
            return
        }

        handler.prepare(view, this)
        recorded.put(handler.tag, handler)
        arbiter.record(handler.tag)
    }

    private fun isViewOverflowingParent(view: View): Boolean {
        val parent = view.parent as? ViewGroup ?: return false
        val matrix = view.matrix
        val localXY = matrixTransformCoords
        localXY[0] = 0f
        localXY[1] = 0f
        matrix.mapPoints(localXY)
        val left = localXY[0] + view.left
        val top = localXY[1] + view.top

        return left < 0f ||
            left + view.width > parent.width ||
            top < 0f ||
            top + view.height > parent.height
    }

    private fun extractAncestorHandlers(view: View, coords: FloatArray, pointerId: Int): Boolean {
        var found = false
        var parent = view.parent

        while (parent != null) {
            // Stop at the root: its own handler was extracted with the rest of the hierarchy.
            if (parent === wrapperView) {
                break
            }

            if (parent is ViewGroup) {
                val parentViewGroup: ViewGroup = parent

                handlerRegistry.getHandlersForView(parent)?.let {
                    for (handler in it) {
                        if (handler.isEnabled && handler.isWithinBounds(view, coords[0], coords[1])) {
                            found = true
                            recordHandlerIfNotPresent(handler, parentViewGroup)
                            handler.startTrackingPointer(pointerId)
                        }
                    }
                }
            }

            parent = parent.parent
        }

        return found
    }

    private fun recordViewHandlersForPointer(view: View, coords: FloatArray, pointerId: Int): Boolean {
        var found = false
        handlerRegistry.getHandlersForView(view)?.let {
            for (handler in it) {
                // skip disabled and out-of-bounds handlers
                if (!handler.isEnabled || !handler.isWithinBounds(view, coords[0], coords[1])) {
                    continue
                }

                recordHandlerIfNotPresent(handler, view)
                handler.startTrackingPointer(pointerId)
                found = true
            }
        }

        // if the pointer is inside the view but it overflows its parent, handlers attached to the parent
        // might not have been extracted (pointer might be in a child, but may be outside parent).
        if (coords[0] in 0f..view.width.toFloat() &&
            coords[1] in 0f..view.height.toFloat() &&
            isViewOverflowingParent(view) &&
            extractAncestorHandlers(view, coords, pointerId)
        ) {
            found = true
        }

        return found
    }

    private fun extractGestureHandlers(event: MotionEvent) {
        val actionIndex = event.actionIndex
        val pointerId = event.getPointerId(actionIndex)
        tempCoords[0] = event.getX(actionIndex)
        tempCoords[1] = event.getY(actionIndex)
        traverseWithPointerEvents(wrapperView, tempCoords, pointerId)
        extractGestureHandlers(wrapperView, tempCoords, pointerId)
    }

    private fun extractGestureHandlers(viewGroup: ViewGroup, coords: FloatArray, pointerId: Int): Boolean {
        val childrenCount = viewGroup.childCount
        for (i in childrenCount - 1 downTo 0) {
            val child = viewGroup.getChildAt(i)
            if (canReceiveEvents(child)) {
                val childPoint = tempPoint
                transformPointToChildViewCoords(coords[0], coords[1], viewGroup, child, childPoint)
                val restoreX = coords[0]
                val restoreY = coords[1]
                coords[0] = childPoint.x
                coords[1] = childPoint.y
                var found = false
                if (!isClipping(child) || isTransformedTouchPointInView(coords[0], coords[1], child)) {
                    // we only consider the view if touch is inside the view bounds or if the view's children
                    // can render outside of the view bounds (overflow visible)
                    found = traverseWithPointerEvents(child, coords, pointerId)
                }
                coords[0] = restoreX
                coords[1] = restoreY
                if (found) {
                    return true
                }
            }
        }
        return false
    }

    private fun trackPointerDownPoints(event: MotionEvent) {
        val index = event.actionIndex
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN ->
                pointerDownPoints.put(event.getPointerId(index), PointF(event.getX(index), event.getY(index)))
            MotionEvent.ACTION_POINTER_UP ->
                pointerDownPoints.remove(event.getPointerId(index))
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL ->
                pointerDownPoints.clear()
        }
    }

    /**
     * Sends ACTION_CANCEL to the views the pointers went down on: once the root
     * intercepts, the framework never cancels them itself.
     */
    fun cancelTouchesInInterceptedViews(event: MotionEvent) {
        viewsToCancel.clear()
        for (i in 0 until pointerDownPoints.size()) {
            val point = pointerDownPoints.valueAt(i)
            tempCoords[0] = point.x
            tempCoords[1] = point.y
            collectViewsAtPoint(wrapperView, tempCoords, viewsToCancel)
        }

        if (viewsToCancel.isEmpty()) {
            return
        }

        val cancelEvent = MotionEvent.obtain(event).apply { action = MotionEvent.ACTION_CANCEL }

        for (view in viewsToCancel) {
            if (view === wrapperView) {
                continue
            }
            view.onTouchEvent(cancelEvent)
            view.stopNestedScroll()
        }

        cancelEvent.recycle()
        viewsToCancel.clear()
    }

    // Collects the view path under the point (topmost child first, like touch dispatch), leaf to root.
    private fun collectViewsAtPoint(view: View, coords: FloatArray, out: MutableList<View>): Boolean {
        val pointerEvents = ViewConfigurationHelper.getPointerEventsConfigForView(view)
        if (pointerEvents == PointerEventsConfig.NONE) {
            return false
        }

        var found = false
        if (view is ViewGroup && pointerEvents != PointerEventsConfig.BOX_ONLY) {
            for (i in view.childCount - 1 downTo 0) {
                val child = view.getChildAt(i)
                if (!canReceiveEvents(child)) {
                    continue
                }
                val childPoint = tempPoint
                transformPointToChildViewCoords(coords[0], coords[1], view, child, childPoint)
                if (isClipping(child) && !isTransformedTouchPointInView(childPoint.x, childPoint.y, child)) {
                    continue
                }
                val restoreX = coords[0]
                val restoreY = coords[1]
                coords[0] = childPoint.x
                coords[1] = childPoint.y
                found = collectViewsAtPoint(child, coords, out)
                coords[0] = restoreX
                coords[1] = restoreY

                if (found) {
                    break
                }
            }
        }

        // BOX_NONE views can't be the target themselves, only their children can
        val selfIsTarget = pointerEvents != PointerEventsConfig.BOX_NONE &&
            isTransformedTouchPointInView(coords[0], coords[1], view)

        if (found || selfIsTarget) {
            // `out` may already contain this view when several pointers share part of their path.
            if (!out.contains(view)) {
                out.add(view)
            }
            return true
        }
        return false
    }

    private fun traverseWithPointerEvents(view: View, coords: FloatArray, pointerId: Int): Boolean =
        when (ViewConfigurationHelper.getPointerEventsConfigForView(view)) {
            PointerEventsConfig.NONE -> {
                // This view and its children can't be the target
                false
            }
            PointerEventsConfig.BOX_ONLY -> {
                // This view is the target, its children don't matter
                (
                    recordViewHandlersForPointer(view, coords, pointerId) ||
                        shouldHandlerlessViewBecomeTouchTarget(view, coords)
                    )
            }
            PointerEventsConfig.BOX_NONE -> {
                // This view can't be the target, but its children might
                when (view) {
                    is ViewGroup -> {
                        extractGestureHandlers(view, coords, pointerId).also { found ->
                            // A child view is handling touch, also extract handlers attached to this view
                            if (found) {
                                recordViewHandlersForPointer(view, coords, pointerId)
                            }
                        }
                    }
                    // A disabled text field reports BOX_NONE, but gestures attached to it should
                    // still work.
                    is EditText -> {
                        recordViewHandlersForPointer(view, coords, pointerId)
                    }
                    else -> false
                }
            }
            PointerEventsConfig.AUTO -> {
                // Either this view or one of its children is the target
                val found = if (view is ViewGroup) {
                    extractGestureHandlers(view, coords, pointerId)
                } else {
                    false
                }

                (
                    recordViewHandlersForPointer(view, coords, pointerId) ||
                        found ||
                        shouldHandlerlessViewBecomeTouchTarget(view, coords)
                    )
            }
        }

    private fun canReceiveEvents(view: View) = view.visibility == View.VISIBLE && view.alpha >= minimumAlphaForTraversal

    // if view is not a view group it is clipping, otherwise we check for `getClipChildren` flag to
    // be turned on and also confirm with the ViewConfigHelper implementation
    private fun isClipping(view: View) = view !is ViewGroup || ViewConfigurationHelper.isViewClippingChildren(view)

    companion object {
        // Be default fully transparent views can receive touch
        private const val DEFAULT_MIN_ALPHA_FOR_TRAVERSAL = 0f
        private val tempPoint = PointF()
        private val matrixTransformCoords = FloatArray(2)
        private val inverseMatrix = Matrix()
        private val tempCoords = FloatArray(2)

        private fun shouldHandlerlessViewBecomeTouchTarget(view: View, coords: FloatArray): Boolean {
            // The following code is to match the iOS behavior where transparent parts of the views can
            // pass touch events through them allowing sibling nodes to handle them.

            // TODO: this is not an ideal solution as we only consider ViewGroups that has no background set
            // TODO: ideally we should determine the pixel color under the given coordinates and return
            val isLeaf = view !is ViewGroup
            val isNotTransparent = view.background != null
            val isPointInView = isTransformedTouchPointInView(coords[0], coords[1], view)

            return (isLeaf || isNotTransparent) && isPointInView
        }

        fun transformPointToChildViewCoords(x: Float, y: Float, parent: ViewGroup, child: View, outLocalPoint: PointF) {
            var localX = x + parent.scrollX - child.left
            var localY = y + parent.scrollY - child.top
            val matrix = child.matrix
            if (!matrix.isIdentity) {
                val localXY = matrixTransformCoords
                localXY[0] = localX
                localXY[1] = localY
                matrix.invert(inverseMatrix)
                inverseMatrix.mapPoints(localXY)
                localX = localXY[0]
                localY = localXY[1]
            }
            outLocalPoint[localX] = localY
        }

        private fun isTransformedTouchPointInView(x: Float, y: Float, child: View) =
            x in 0f..child.width.toFloat() && y in 0f..child.height.toFloat()
    }
}
