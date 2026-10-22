// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/android/src/main/java/com/swmansion/gesturehandler/core/GestureHandler.kt
// and .../react/events/eventbuilders/GestureHandlerEventDataBuilder.kt),
// MIT License, Copyright (c) 2016 Software Mansion.
package dev.kuito.runtime.renderer.gestures

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.graphics.PointF
import android.view.MotionEvent
import android.view.MotionEvent.PointerCoords
import android.view.MotionEvent.PointerProperties
import android.view.View
import java.util.Arrays

internal open class GestureHandler {
    private val trackedPointerIDs = IntArray(MAX_POINTERS_COUNT)
    private var trackedPointersIDsCount = 0
    private val windowOffset = IntArray(2) { 0 }
    var tag = 0
    var view: View? = null
        private set
    /** The shared table the registry gave this handler: its state lives there. */
    var table: GestureTable? = null

    /** The last state the shared arbiter moved it to. */
    val state: Int
        get() = table?.state(tag) ?: STATE_UNDETERMINED
    var x = 0f
        private set
    var y = 0f
        private set
    var isWithinBounds = false
        private set
    var isEnabled = true
        protected set(enabled) {
            // Don't cancel handler when not changing the value of the isEnabled, executing it always caused
            // handlers to be cancelled on re-render because that's the moment when the config is updated.
            // If the enabled prop "changed" from true to true the handler would get cancelled.
            if (view != null && isEnabled != enabled) {
                // If view is set then handler is in "active" state. In that case we want to "cancel" handler
                // when it changes enabled state so that it gets cleared from the orchestrator
                cancel()
            }
            field = enabled
        }

    private var hitSlop: FloatArray? = null
    var lastAbsolutePositionX = 0f
        private set
    var lastAbsolutePositionY = 0f
        private set

    private var lastEventOffsetX = 0f
    private var lastEventOffsetY = 0f
    var numberOfPointers = 0
        protected set
    protected var shouldCancelWhenOutside = false
    protected var orchestrator: GestureHandlerOrchestrator? = null
    var onTouchEventListener: OnTouchEventListener? = null
    var pointerType: Int = POINTER_TYPE_OTHER
        private set

    open fun dispatchStateChange(newState: Int, prevState: Int) {
        onTouchEventListener?.onStateChange(this, newState, prevState)
    }

    open fun dispatchHandlerUpdate(event: MotionEvent) {
        onTouchEventListener?.onHandlerUpdate(this, event)
    }

    open fun resetConfig() {
        shouldCancelWhenOutside = DEFAULT_SHOULD_CANCEL_WHEN_OUTSIDE
        isEnabled = DEFAULT_IS_ENABLED
        hitSlop = DEFAULT_HIT_SLOP
    }

    fun hasCommonPointers(other: GestureHandler): Boolean {
        for (i in trackedPointerIDs.indices) {
            if (trackedPointerIDs[i] != -1 && other.trackedPointerIDs[i] != -1) {
                return true
            }
        }
        return false
    }

    fun setHitSlop(leftPad: Float, topPad: Float, rightPad: Float, bottomPad: Float, width: Float, height: Float) {
        val hitSlop = hitSlop ?: FloatArray(6).also { hitSlop = it }

        hitSlop[HIT_SLOP_LEFT_IDX] = leftPad
        hitSlop[HIT_SLOP_TOP_IDX] = topPad
        hitSlop[HIT_SLOP_RIGHT_IDX] = rightPad
        hitSlop[HIT_SLOP_BOTTOM_IDX] = bottomPad
        hitSlop[HIT_SLOP_WIDTH_IDX] = width
        hitSlop[HIT_SLOP_HEIGHT_IDX] = height
    }

    fun setHitSlop(padding: Float?) {
        if (padding == null) {
            hitSlop = DEFAULT_HIT_SLOP
        } else {
            setHitSlop(padding, padding, padding, padding, HIT_SLOP_NONE, HIT_SLOP_NONE)
        }
    }

    fun prepare(view: View?, orchestrator: GestureHandlerOrchestrator?) {
        check(!(this.view != null || this.orchestrator != null)) {
            "Already prepared or hasn't been reset"
        }
        Arrays.fill(trackedPointerIDs, -1)
        trackedPointersIDsCount = 0
        this.view = view
        this.orchestrator = orchestrator

        val content = view?.context.findActivity()?.findViewById<View>(android.R.id.content)
        if (content != null) {
            content.getLocationOnScreen(windowOffset)
        } else {
            windowOffset[0] = 0
            windowOffset[1] = 0
        }
    }

    private fun findNextLocalPointerId(): Int {
        var localPointerId = 0
        while (localPointerId < trackedPointersIDsCount) {
            var i = 0
            while (i < trackedPointerIDs.size) {
                if (trackedPointerIDs[i] == localPointerId) {
                    break
                }
                i++
            }
            if (i == trackedPointerIDs.size) {
                return localPointerId
            }
            localPointerId++
        }
        return localPointerId
    }

    fun startTrackingPointer(pointerId: Int) {
        if (isTrackingPointer(pointerId)) {
            return
        }

        trackedPointerIDs[pointerId] = findNextLocalPointerId()
        trackedPointersIDsCount++
    }

    fun stopTrackingPointer(pointerId: Int) {
        if (!isTrackingPointer(pointerId)) {
            return
        }

        trackedPointerIDs[pointerId] = -1
        trackedPointersIDsCount--
    }

    private fun isTrackingPointer(pointerId: Int) = trackedPointerIDs[pointerId] != -1

    private fun needAdapt(event: MotionEvent): Boolean {
        if (event.pointerCount != trackedPointersIDsCount) {
            return true
        }

        for (i in trackedPointerIDs.indices) {
            val trackedPointer = trackedPointerIDs[i]
            if (trackedPointer != -1 && trackedPointer != i) {
                return true
            }
        }
        return false
    }

    /**
     * The handler sees only the pointers it tracks, renumbered from zero: the
     * event is rebuilt with those pointers, and a pointer going down or up that
     * it does not track becomes a move.
     */
    private fun adaptEvent(event: MotionEvent): MotionEvent {
        if (!needAdapt(event)) {
            return event
        }
        var action = event.actionMasked
        var actionIndex = -1
        if (action == MotionEvent.ACTION_DOWN || action == MotionEvent.ACTION_POINTER_DOWN) {
            actionIndex = event.actionIndex
            val actionPointer = event.getPointerId(actionIndex)
            action = if (trackedPointerIDs[actionPointer] != -1) {
                if (trackedPointersIDsCount == 1) {
                    MotionEvent.ACTION_DOWN
                } else {
                    MotionEvent.ACTION_POINTER_DOWN
                }
            } else {
                MotionEvent.ACTION_MOVE
            }
        } else if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_POINTER_UP) {
            actionIndex = event.actionIndex
            val actionPointer = event.getPointerId(actionIndex)
            action = if (trackedPointerIDs[actionPointer] != -1) {
                if (trackedPointersIDsCount == 1) {
                    MotionEvent.ACTION_UP
                } else {
                    MotionEvent.ACTION_POINTER_UP
                }
            } else {
                MotionEvent.ACTION_MOVE
            }
        }
        var count = 0
        val deltaX = event.rawX - event.x
        val deltaY = event.rawY - event.y
        event.offsetLocation(deltaX, deltaY)
        var index = 0
        val size = event.pointerCount
        while (index < size) {
            val origPointerId = event.getPointerId(index)
            if (trackedPointerIDs[origPointerId] != -1) {
                event.getPointerProperties(index, pointerProps[count])
                pointerProps[count].id = trackedPointerIDs[origPointerId]
                event.getPointerCoords(index, pointerCoords[count])
                if (index == actionIndex) {
                    action = action or (count shl MotionEvent.ACTION_POINTER_INDEX_SHIFT)
                }
                count++
            }
            index++
        }

        val result: MotionEvent
        try {
            result = MotionEvent.obtain(
                event.downTime,
                event.eventTime,
                action,
                count,
                pointerProps, /* props are copied and hence it is safe to use static array here */
                pointerCoords, /* same applies to coords */
                event.metaState,
                event.buttonState,
                event.xPrecision,
                event.yPrecision,
                event.deviceId,
                event.edgeFlags,
                event.source,
                event.flags,
            )
        } catch (e: IllegalArgumentException) {
            throw AdaptEventException(this, event, e)
        }
        event.offsetLocation(-deltaX, -deltaY)
        result.offsetLocation(-deltaX, -deltaY)
        return result
    }

    // exception to help debug https://github.com/software-mansion/react-native-gesture-handler/issues/1188
    class AdaptEventException(handler: GestureHandler, event: MotionEvent, e: IllegalArgumentException) :
        Exception(
            """
            handler: ${handler::class.simpleName}
            state: ${handler.state}
            view: ${handler.view}
            isEnabled: ${handler.isEnabled}
            trackedPointersCount: ${handler.trackedPointersIDsCount}
            trackedPointers: ${handler.trackedPointerIDs.joinToString(separator = ", ")}
            while handling event: $event
            """.trimIndent(),
            e,
        )

    fun handle(transformedEvent: MotionEvent, sourceEvent: MotionEvent) {
        if (!isEnabled ||
            state == STATE_CANCELLED ||
            state == STATE_FAILED ||
            state == STATE_END ||
            trackedPointersIDsCount < 1
        ) {
            return
        }

        // a workaround for https://github.com/software-mansion/react-native-gesture-handler/issues/1188
        val (adaptedTransformedEvent, adaptedSourceEvent) = try {
            arrayOf(adaptEvent(transformedEvent), adaptEvent(sourceEvent))
        } catch (e: AdaptEventException) {
            fail()
            return
        }

        numberOfPointers = when (adaptedTransformedEvent.actionMasked) {
            MotionEvent.ACTION_POINTER_UP -> adaptedTransformedEvent.pointerCount - 1
            else -> adaptedTransformedEvent.pointerCount
        }

        x = adaptedTransformedEvent.x
        y = adaptedTransformedEvent.y
        isWithinBounds = isWithinBounds(view, x, y)

        if (shouldCancelWhenOutside) {
            if (!isWithinBounds && (state == STATE_ACTIVE || state == STATE_BEGAN)) {
                fail()
                return
            }
        }

        lastAbsolutePositionX = GestureUtils.getLastPointerX(adaptedTransformedEvent, true)
        lastAbsolutePositionY = GestureUtils.getLastPointerY(adaptedTransformedEvent, true)
        lastEventOffsetX = adaptedTransformedEvent.rawX - adaptedTransformedEvent.x
        lastEventOffsetY = adaptedTransformedEvent.rawY - adaptedTransformedEvent.y

        if (sourceEvent.action == MotionEvent.ACTION_DOWN) {
            setPointerType(sourceEvent)
        }

        onHandle(adaptedTransformedEvent, adaptedSourceEvent)

        if (adaptedTransformedEvent != transformedEvent) {
            adaptedTransformedEvent.recycle()
        }
        if (adaptedSourceEvent != sourceEvent) {
            adaptedSourceEvent.recycle()
        }
    }

    fun wantsEvent(event: MotionEvent): Boolean {
        if (!isEnabled || state == STATE_FAILED || state == STATE_CANCELLED || state == STATE_END) {
            return false
        }

        if (event.actionMasked == MotionEvent.ACTION_MOVE) {
            for (i in 0 until event.pointerCount) {
                if (isTrackingPointer(event.getPointerId(i))) {
                    return true
                }
            }
            return false
        } else {
            return isTrackingPointer(event.getPointerId(event.actionIndex))
        }
    }

    /** An app gesture about to activate, or active, gives way only to the root's own handler. */
    fun shouldBeCancelledBy(handler: GestureHandler): Boolean =
        tag >= 0 && handler is GestureHandlerRootHelper.RootViewGestureHandler

    fun isWithinBounds(view: View?, posX: Float, posY: Float): Boolean {
        if (view == null) {
            return false
        }

        var left = 0f
        var top = 0f
        var right = view.width.toFloat()
        var bottom = view.height.toFloat()
        hitSlop?.let { hitSlop ->
            val padLeft = hitSlop[HIT_SLOP_LEFT_IDX]
            val padTop = hitSlop[HIT_SLOP_TOP_IDX]
            val padRight = hitSlop[HIT_SLOP_RIGHT_IDX]
            val padBottom = hitSlop[HIT_SLOP_BOTTOM_IDX]
            if (hitSlopSet(padLeft)) {
                left -= padLeft
            }
            if (hitSlopSet(padTop)) {
                top -= padTop
            }
            if (hitSlopSet(padRight)) {
                right += padRight
            }
            if (hitSlopSet(padBottom)) {
                bottom += padBottom
            }
            val width = hitSlop[HIT_SLOP_WIDTH_IDX]
            val height = hitSlop[HIT_SLOP_HEIGHT_IDX]
            if (hitSlopSet(width)) {
                if (!hitSlopSet(padLeft)) {
                    left = right - width
                } else if (!hitSlopSet(padRight)) {
                    right = left + width
                }
            }
            if (hitSlopSet(height)) {
                if (!hitSlopSet(padTop)) {
                    top = bottom - height
                } else if (!hitSlopSet(padBottom)) {
                    bottom = top + height
                }
            }
        }
        return posX in left..right && posY in top..bottom
    }

    // The shared arbiter guards each change and decides what follows from it
    // (native/shared/gestures/GestureArbiter.h).
    fun cancel() = table().cancel(tag)

    fun fail() = table().fail(tag)

    open fun activate() = table().activate(tag)

    fun begin() = table().begin(tag)

    fun end() = table().end(tag)

    private fun table() = checkNotNull(table) { "Gesture handler $this changed state before the registry had it" }

    /*
     * Returns true if the view this handler is attached to is a descendant of the view the other handler
     * is attached to and false otherwise.
     */
    fun isDescendantOf(of: GestureHandler): Boolean {
        var view = this.view?.parent as? View
        while (view != null) {
            if (view == of.view) {
                return true
            }

            view = view.parent as? View
        }
        return false
    }

    // responsible for resetting the state of handler upon activation (may be called more than once
    // if the handler is waiting for failure of other one)
    open fun resetProgress() {}

    protected open fun initialize(event: MotionEvent, sourceEvent: MotionEvent) {}
    protected open fun onHandle(event: MotionEvent, sourceEvent: MotionEvent) {
        fail()
    }

    /** After the arbiter took a state change into account. */
    open fun onStateChange(newState: Int, previousState: Int) {}
    protected open fun onReset() {}
    /** Before the handler is cancelled: it stops what it scheduled. */
    open fun onCancel() {}

    /**
     * Transforms a point in the coordinate space of the wrapperView (the root) to
     * coordinate space of the view the gesture is attached to.
     *
     * If the gesture handler is not currently attached to a view, it will return (NaN, NaN).
     *
     * This method modifies and transforms the received point.
     */
    protected fun transformPoint(point: PointF): PointF =
        orchestrator?.transformPointToViewCoords(view, point) ?: run {
            point.x = Float.NaN
            point.y = Float.NaN
            point
        }

    fun reset() {
        view = null
        orchestrator = null
        Arrays.fill(trackedPointerIDs, -1)
        trackedPointersIDsCount = 0
        onReset()
    }

    private fun setPointerType(event: MotionEvent) {
        pointerType = when (event.getToolType(event.actionIndex)) {
            MotionEvent.TOOL_TYPE_FINGER -> POINTER_TYPE_TOUCH
            MotionEvent.TOOL_TYPE_STYLUS, MotionEvent.TOOL_TYPE_ERASER -> POINTER_TYPE_STYLUS
            MotionEvent.TOOL_TYPE_MOUSE -> POINTER_TYPE_MOUSE
            else -> POINTER_TYPE_OTHER
        }
    }

    override fun toString(): String {
        val viewString = view?.javaClass?.simpleName
        return this.javaClass.simpleName + "@[" + tag + "]:" + viewString
    }

    val lastRelativePositionX: Float
        get() = lastAbsolutePositionX
    val lastRelativePositionY: Float
        get() = lastAbsolutePositionY

    val lastPositionInWindowX: Float
        get() = lastAbsolutePositionX + lastEventOffsetX - windowOffset[0]
    val lastPositionInWindowY: Float
        get() = lastAbsolutePositionY + lastEventOffsetY - windowOffset[1]

    /** Replaces the whole configuration: keys the config leaves out return to their defaults. */
    fun setConfig(config: GestureConfig) {
        resetConfig()
        updateConfig(config)
    }

    protected open fun updateConfig(config: GestureConfig) {
        if (config.has(KEY_SHOULD_CANCEL_WHEN_OUTSIDE)) {
            shouldCancelWhenOutside = config.boolean(KEY_SHOULD_CANCEL_WHEN_OUTSIDE)
        }
        if (config.has(KEY_ENABLED)) {
            isEnabled = config.boolean(KEY_ENABLED)
        }
        if (config.has(KEY_HIT_SLOP)) {
            handleHitSlopProperty(config)
        }
    }

    /**
     * `hitSlop` is a number (every edge) or React Native's `{ left, top, right,
     * bottom, width, height, horizontal, vertical }`, in dp; `null` clears it.
     */
    private fun handleHitSlopProperty(config: GestureConfig) {
        if (config.isNull(KEY_HIT_SLOP)) {
            setHitSlop(null)
            return
        }

        if (config.isNumber(KEY_HIT_SLOP)) {
            setHitSlop(config.px(KEY_HIT_SLOP))
            return
        }

        val hitSlop = config.config(KEY_HIT_SLOP)
        var left = HIT_SLOP_NONE
        var top = HIT_SLOP_NONE
        var right = HIT_SLOP_NONE
        var bottom = HIT_SLOP_NONE
        var width = HIT_SLOP_NONE
        var height = HIT_SLOP_NONE
        if (hitSlop.has(KEY_HIT_SLOP_HORIZONTAL)) {
            val horizontalPad = hitSlop.px(KEY_HIT_SLOP_HORIZONTAL)
            left = horizontalPad
            right = horizontalPad
        }
        if (hitSlop.has(KEY_HIT_SLOP_VERTICAL)) {
            val verticalPad = hitSlop.px(KEY_HIT_SLOP_VERTICAL)
            top = verticalPad
            bottom = verticalPad
        }
        if (hitSlop.has(KEY_HIT_SLOP_LEFT)) {
            left = hitSlop.px(KEY_HIT_SLOP_LEFT)
        }
        if (hitSlop.has(KEY_HIT_SLOP_TOP)) {
            top = hitSlop.px(KEY_HIT_SLOP_TOP)
        }
        if (hitSlop.has(KEY_HIT_SLOP_RIGHT)) {
            right = hitSlop.px(KEY_HIT_SLOP_RIGHT)
        }
        if (hitSlop.has(KEY_HIT_SLOP_BOTTOM)) {
            bottom = hitSlop.px(KEY_HIT_SLOP_BOTTOM)
        }
        if (hitSlop.has(KEY_HIT_SLOP_WIDTH)) {
            width = hitSlop.px(KEY_HIT_SLOP_WIDTH)
        }
        if (hitSlop.has(KEY_HIT_SLOP_HEIGHT)) {
            height = hitSlop.px(KEY_HIT_SLOP_HEIGHT)
        }
        setHitSlop(left, top, right, bottom, width, height)
    }

    /** The event payload every gesture carries; lengths in dp. Handlers add their own fields. */
    open fun buildEventData(eventData: GestureEventData, density: Float) {
        eventData.numberOfPointers = numberOfPointers
        eventData.pointerType = pointerType
    }

    companion object {
        fun isFinished(state: Int) = state == STATE_CANCELLED || state == STATE_FAILED || state == STATE_END

        private const val DEFAULT_SHOULD_CANCEL_WHEN_OUTSIDE = false
        private const val DEFAULT_IS_ENABLED = true
        private val DEFAULT_HIT_SLOP: FloatArray? = null

        private const val KEY_SHOULD_CANCEL_WHEN_OUTSIDE = "shouldCancelWhenOutside"
        private const val KEY_ENABLED = "enabled"
        private const val KEY_HIT_SLOP = "hitSlop"
        private const val KEY_HIT_SLOP_LEFT = "left"
        private const val KEY_HIT_SLOP_TOP = "top"
        private const val KEY_HIT_SLOP_RIGHT = "right"
        private const val KEY_HIT_SLOP_BOTTOM = "bottom"
        private const val KEY_HIT_SLOP_VERTICAL = "vertical"
        private const val KEY_HIT_SLOP_HORIZONTAL = "horizontal"
        private const val KEY_HIT_SLOP_WIDTH = "width"
        private const val KEY_HIT_SLOP_HEIGHT = "height"

        const val STATE_UNDETERMINED = 0
        const val STATE_FAILED = 1
        const val STATE_BEGAN = 2
        const val STATE_CANCELLED = 3
        const val STATE_ACTIVE = 4
        const val STATE_END = 5
        const val HIT_SLOP_NONE = Float.NaN
        private const val HIT_SLOP_LEFT_IDX = 0
        private const val HIT_SLOP_TOP_IDX = 1
        private const val HIT_SLOP_RIGHT_IDX = 2
        private const val HIT_SLOP_BOTTOM_IDX = 3
        private const val HIT_SLOP_WIDTH_IDX = 4
        private const val HIT_SLOP_HEIGHT_IDX = 5
        const val DIRECTION_RIGHT = 1
        const val DIRECTION_LEFT = 2
        const val DIRECTION_UP = 4
        const val DIRECTION_DOWN = 8
        const val POINTER_TYPE_TOUCH = 0
        const val POINTER_TYPE_STYLUS = 1
        const val POINTER_TYPE_MOUSE = 2
        const val POINTER_TYPE_OTHER = 4
        private const val MAX_POINTERS_COUNT = 17
        private val pointerProps = Array(MAX_POINTERS_COUNT) { PointerProperties() }
        private val pointerCoords = Array(MAX_POINTERS_COUNT) { PointerCoords() }

        private fun hitSlopSet(value: Float): Boolean = !value.isNaN()

        // Views get the activity, possibly behind context wrappers.
        private fun Context?.findActivity(): Activity? = when (this) {
            is Activity -> this
            is ContextWrapper -> baseContext.findActivity()
            else -> null
        }
    }
}
