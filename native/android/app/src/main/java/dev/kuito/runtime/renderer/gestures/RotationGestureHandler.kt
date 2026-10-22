// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/android/src/main/java/com/swmansion/gesturehandler/core/RotationGestureHandler.kt
// and .../react/events/eventbuilders/RotationGestureHandlerEventDataBuilder.kt),
// MIT License, Copyright (c) 2016 Software Mansion.
package dev.kuito.runtime.renderer.gestures

import android.graphics.PointF
import android.view.MotionEvent
import dev.kuito.runtime.renderer.gestures.RotationGestureDetector.OnRotationGestureListener
import kotlin.math.abs

internal class RotationGestureHandler : GestureHandler() {
    private var rotationGestureDetector: RotationGestureDetector? = null
    var rotation = 0.0
        private set
    var velocity = 0.0
        private set
    var anchorX: Float = Float.NaN
        private set
    var anchorY: Float = Float.NaN
        private set

    private val gestureListener: OnRotationGestureListener = object : OnRotationGestureListener {
        override fun onRotation(detector: RotationGestureDetector): Boolean {
            val prevRotation: Double = rotation
            rotation += detector.rotation
            val delta = detector.timeDelta
            if (delta > 0) {
                velocity = (rotation - prevRotation) / delta
            }
            if (abs(rotation) >= ROTATION_RECOGNITION_THRESHOLD && state == STATE_BEGAN) {
                activate()
            }
            return true
        }

        override fun onRotationBegin(detector: RotationGestureDetector) = true

        override fun onRotationEnd(detector: RotationGestureDetector) {
            if (state == STATE_ACTIVE) {
                end()
            } else {
                fail()
            }
        }
    }

    override fun initialize(event: MotionEvent, sourceEvent: MotionEvent) {
        resetProgress()
        rotationGestureDetector = RotationGestureDetector(gestureListener)

        // set the anchor to the position of the first pointer as NaN causes the event not to arrive
        this.anchorX = event.x
        this.anchorY = event.y
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

        rotationGestureDetector?.onTouchEvent(sourceEvent)
        rotationGestureDetector?.let {
            val point = transformPoint(PointF(it.anchorX, it.anchorY))
            anchorX = point.x
            anchorY = point.y
        }

        // ACTION_UP is already handled in rotationGestureDetector.onTouchEvent (and effectively in onRotationEnd)
        // if more than one pointer was used
        if (sourceEvent.actionMasked == MotionEvent.ACTION_UP) {
            when (state) {
                STATE_UNDETERMINED -> cancel()
                STATE_BEGAN -> fail()
            }
        }
    }

    override fun activate() {
        // reset rotation if the handler has not yet activated
        if (state != STATE_ACTIVE) {
            resetProgress()
        }
        super.activate()
    }

    override fun onReset() {
        rotationGestureDetector = null
        anchorX = Float.NaN
        anchorY = Float.NaN
        resetProgress()
    }

    override fun resetProgress() {
        velocity = 0.0
        rotation = 0.0
    }

    override fun buildEventData(eventData: GestureEventData, density: Float) {
        super.buildEventData(eventData, density)

        eventData.rotation = rotation
        eventData.anchorX = (anchorX / density).toDouble()
        eventData.anchorY = (anchorY / density).toDouble()
        eventData.velocity = velocity
    }

    companion object {
        private const val ROTATION_RECOGNITION_THRESHOLD = Math.PI / 36.0 // 5 deg in radians
    }
}
