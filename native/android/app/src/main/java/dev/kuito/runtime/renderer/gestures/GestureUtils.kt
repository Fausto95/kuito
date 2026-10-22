// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/android/src/main/java/com/swmansion/gesturehandler/core/GestureUtils.kt),
// MIT License, Copyright (c) 2016 Software Mansion.
package dev.kuito.runtime.renderer.gestures

import android.view.MotionEvent
import kotlin.math.cos

internal object GestureUtils {
    fun getLastPointerX(event: MotionEvent, averageTouches: Boolean): Float {
        val excludeIndex = if (event.actionMasked == MotionEvent.ACTION_POINTER_UP) {
            event.actionIndex
        } else {
            -1
        }
        return if (averageTouches) {
            var sum = 0f
            var count = 0
            for (i in 0 until event.pointerCount) {
                if (i != excludeIndex) {
                    sum += event.getX(i)
                    count++
                }
            }
            sum / count
        } else {
            var lastPointerIdx = event.pointerCount - 1
            if (lastPointerIdx == excludeIndex) {
                lastPointerIdx--
            }
            event.getX(lastPointerIdx)
        }
    }

    fun getLastPointerY(event: MotionEvent, averageTouches: Boolean): Float {
        val excludeIndex = if (event.actionMasked ==
            MotionEvent.ACTION_POINTER_UP
        ) {
            event.actionIndex
        } else {
            -1
        }
        return if (averageTouches) {
            var sum = 0f
            var count = 0
            for (i in 0 until event.pointerCount) {
                if (i != excludeIndex) {
                    sum += event.getY(i)
                    count++
                }
            }
            sum / count
        } else {
            var lastPointerIdx = event.pointerCount - 1
            if (lastPointerIdx == excludeIndex) {
                lastPointerIdx -= 1
            }
            event.getY(lastPointerIdx)
        }
    }

    fun coneToDeviation(angle: Double): Double = cos(Math.toRadians(angle / 2.0))
}
