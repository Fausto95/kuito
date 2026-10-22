// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/android/src/main/java/com/swmansion/gesturehandler/core/ScaleGestureDetector.java),
// MIT License, Copyright (c) 2016 Software Mansion. RNGH copied it from the
// Android Open Source Project's android.view.ScaleGestureDetector, Apache
// License 2.0, Copyright (C) 2010 The Android Open Source Project, setting the
// minimum span to 0. Pinch uses only the two-finger scale, so the anchored
// modes (double-tap quick scale and stylus-button scale) are left out.
package dev.kuito.runtime.renderer.gestures

import android.content.Context
import android.view.MotionEvent
import android.view.ViewConfiguration
import kotlin.math.abs
import kotlin.math.hypot

/**
 * Detects scaling transformation gestures using the supplied [MotionEvent]s.
 * The [OnScaleGestureListener] callback will notify users when a particular
 * gesture event has occurred.
 */
internal class ScaleGestureDetector(context: Context, private val listener: OnScaleGestureListener) {
    /**
     * An application will receive events in the following order: one
     * [onScaleBegin], zero or more [onScale], one [onScaleEnd].
     */
    interface OnScaleGestureListener {
        /**
         * Responds to scaling events for a gesture in progress. Returns whether
         * the detector should consider this event as handled: if not, the
         * detector keeps accumulating movement until an event is handled.
         */
        fun onScale(detector: ScaleGestureDetector): Boolean

        /** Responds to the beginning of a scaling gesture; false ignores the rest of it. */
        fun onScaleBegin(detector: ScaleGestureDetector): Boolean

        fun onScaleEnd(detector: ScaleGestureDetector)
    }

    /** The X coordinate of the current gesture's focal point. */
    var focusX = 0f
        private set

    /** The Y coordinate of the current gesture's focal point. */
    var focusY = 0f
        private set

    /** The average distance between each of the pointers forming the gesture, through the focal point. */
    var currentSpan = 0f
        private set
    private var prevSpan = 0f
    private var initialSpan = 0f
    private var currTime = 0L
    private var prevTime = 0L
    private var inProgress = false
    private val spanSlop = ViewConfiguration.get(context).scaledTouchSlop * 2

    // Set to zero, to allow for scaling when distance between fingers is small.
    private val minSpan = 0f

    /** The scaling factor from the previous scale event to the current one. */
    val scaleFactor: Float
        get() = if (prevSpan > 0) currentSpan / prevSpan else 1f

    /** The time difference in milliseconds between the previous accepted scaling event and the current one. */
    private val timeDelta: Long
        get() = currTime - prevTime

    val timeDeltaSeconds: Double
        get() = timeDelta.toDouble() / 1000

    fun onTouchEvent(event: MotionEvent): Boolean {
        currTime = event.eventTime

        val action = event.actionMasked
        val count = event.pointerCount
        val streamComplete = action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL

        if (action == MotionEvent.ACTION_DOWN || streamComplete) {
            // Reset any scale in progress with the listener.
            // If it's an ACTION_DOWN we're beginning a new event stream.
            // This means the app probably didn't give us all the events. Shame on it.
            if (inProgress) {
                listener.onScaleEnd(this)
                inProgress = false
                initialSpan = 0f
            }

            if (streamComplete) {
                return true
            }
        }

        val configChanged = action == MotionEvent.ACTION_DOWN ||
            action == MotionEvent.ACTION_POINTER_UP ||
            action == MotionEvent.ACTION_POINTER_DOWN

        val pointerUp = action == MotionEvent.ACTION_POINTER_UP
        val skipIndex = if (pointerUp) event.actionIndex else -1

        // Determine focal point
        var sumX = 0f
        var sumY = 0f
        val div = if (pointerUp) count - 1 else count
        for (i in 0 until count) {
            if (skipIndex == i) continue
            sumX += event.getX(i)
            sumY += event.getY(i)
        }
        val focusX = sumX / div
        val focusY = sumY / div

        // Determine average deviation from focal point
        var devSumX = 0f
        var devSumY = 0f
        for (i in 0 until count) {
            if (skipIndex == i) continue

            // Convert the resulting diameter into a radius.
            devSumX += abs(event.getX(i) - focusX)
            devSumY += abs(event.getY(i) - focusY)
        }
        val devX = devSumX / div
        val devY = devSumY / div

        // Span is the average distance between touch points through the focal point;
        // i.e. the diameter of the circle with a radius of the average deviation from
        // the focal point.
        val spanX = devX * 2
        val spanY = devY * 2
        val span = hypot(spanX, spanY)

        // Dispatch begin/end events as needed.
        // If the configuration changes, notify the app to reset its current state by beginning
        // a fresh scale event stream.
        val wasInProgress = inProgress
        this.focusX = focusX
        this.focusY = focusY
        if (inProgress && (span < minSpan || configChanged)) {
            listener.onScaleEnd(this)
            inProgress = false
            initialSpan = span
        }
        if (configChanged) {
            currentSpan = span
            prevSpan = span
            initialSpan = span
        }

        if (!inProgress && span >= minSpan &&
            (wasInProgress || abs(span - initialSpan) > spanSlop)
        ) {
            currentSpan = span
            prevSpan = span
            prevTime = currTime
            inProgress = listener.onScaleBegin(this)
        }

        // Handle motion; focal point and span/scale factor are changing.
        if (action == MotionEvent.ACTION_MOVE) {
            currentSpan = span

            var updatePrev = true

            if (inProgress) {
                updatePrev = listener.onScale(this)
            }

            if (updatePrev) {
                prevSpan = currentSpan
                prevTime = currTime
            }
        }

        return true
    }
}
