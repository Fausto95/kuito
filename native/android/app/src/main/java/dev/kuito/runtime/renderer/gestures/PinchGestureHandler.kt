// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/android/src/main/java/com/swmansion/gesturehandler/core/PinchGestureHandler.kt
// and .../react/events/eventbuilders/PinchGestureHandlerEventDataBuilder.kt),
// MIT License, Copyright (c) 2016 Software Mansion.
package dev.kuito.runtime.renderer.gestures

import android.content.Context
import android.graphics.PointF
import android.view.MotionEvent
import android.view.ViewConfiguration
import kotlin.math.abs

internal class PinchGestureHandler(private val context: Context) : GestureHandler() {
    var scale = 0.0
        private set
    var velocity = 0.0
        private set
    var focalPointX: Float = Float.NaN
        private set
    var focalPointY: Float = Float.NaN
        private set

    private var scaleGestureDetector: ScaleGestureDetector? = null
    private var startingSpan = 0f
    private var spanSlop = 0f
    private val gestureListener: ScaleGestureDetector.OnScaleGestureListener = object :
        ScaleGestureDetector.OnScaleGestureListener {
        override fun onScale(detector: ScaleGestureDetector): Boolean {
            val prevScaleFactor: Double = scale
            scale *= detector.scaleFactor.toDouble()
            val delta = detector.timeDeltaSeconds

            if (delta > 0) {
                velocity = (scale - prevScaleFactor) / delta
            }
            if (abs(startingSpan - detector.currentSpan) >= spanSlop &&
                state == STATE_BEGAN
            ) {
                activate()
            }
            return true
        }

        override fun onScaleBegin(detector: ScaleGestureDetector): Boolean {
            startingSpan = detector.currentSpan
            return true
        }

        override fun onScaleEnd(detector: ScaleGestureDetector) {
            // ScaleGestureDetector thinks that when fingers are 27mm away that's a sufficiently good
            // reason to trigger this method giving us no other choice but to ignore it completely.
        }
    }

    override fun initialize(event: MotionEvent, sourceEvent: MotionEvent) {
        resetProgress()
        scaleGestureDetector = ScaleGestureDetector(context, gestureListener)
        val configuration = ViewConfiguration.get(context)
        spanSlop = configuration.scaledTouchSlop.toFloat()

        // set the focal point to the position of the first pointer as NaN causes the event not to arrive
        this.focalPointX = event.x
        this.focalPointY = event.y
    }

    override fun onHandle(event: MotionEvent, sourceEvent: MotionEvent) {
        if (state == STATE_UNDETERMINED) {
            when (sourceEvent.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    initialize(event, sourceEvent)
                }

                MotionEvent.ACTION_POINTER_DOWN -> {
                    begin()
                }
            }
        }

        scaleGestureDetector?.onTouchEvent(sourceEvent)
        scaleGestureDetector?.let {
            val point = transformPoint(PointF(it.focusX, it.focusY))
            this.focalPointX = point.x
            this.focalPointY = point.y
        }

        if (sourceEvent.actionMasked == MotionEvent.ACTION_UP) {
            when (state) {
                STATE_UNDETERMINED -> cancel()
                STATE_ACTIVE -> end()
                else -> fail()
            }
        }
    }

    override fun activate() {
        // reset scale if the handler has not yet activated
        if (state != STATE_ACTIVE) {
            resetProgress()
        }
        super.activate()
    }

    override fun onReset() {
        scaleGestureDetector = null
        focalPointX = Float.NaN
        focalPointY = Float.NaN
        resetProgress()
    }

    override fun resetProgress() {
        velocity = 0.0
        scale = 1.0
    }

    override fun buildEventData(eventData: GestureEventData, density: Float) {
        super.buildEventData(eventData, density)

        eventData.scale = scale
        eventData.focalX = (focalPointX / density).toDouble()
        eventData.focalY = (focalPointY / density).toDouble()
        eventData.velocity = velocity
    }
}
