// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/android/src/main/java/com/swmansion/gesturehandler/core/TapGestureHandler.kt
// and .../react/events/eventbuilders/TapGestureHandlerEventDataBuilder.kt),
// MIT License, Copyright (c) 2016 Software Mansion.
package dev.kuito.runtime.renderer.gestures

import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import dev.kuito.runtime.renderer.gestures.GestureUtils.getLastPointerX
import dev.kuito.runtime.renderer.gestures.GestureUtils.getLastPointerY
import kotlin.math.abs

internal class TapGestureHandler : GestureHandler() {
    private var maxDeltaX = MAX_VALUE_IGNORE
    private var maxDeltaY = MAX_VALUE_IGNORE
    private var maxDist = MAX_VALUE_IGNORE
    private var maxDurationMs = DEFAULT_MAX_DURATION_MS
    private var maxDelayMs = DEFAULT_MAX_DELAY_MS
    private var numberOfTaps = DEFAULT_NUMBER_OF_TAPS
    private var minNumberOfPointers = DEFAULT_MIN_NUMBER_OF_POINTERS
    private var currentMaxNumberOfPointers = 1
    private var startX = 0f
    private var startY = 0f
    private var offsetX = 0f
    private var offsetY = 0f
    private var lastX = 0f
    private var lastY = 0f
    private val handler = Handler(Looper.getMainLooper())
    private var tapsSoFar = 0
    private val failDelayed = Runnable { fail() }

    init {
        shouldCancelWhenOutside = true
    }

    override fun resetConfig() {
        super.resetConfig()
        maxDeltaX = MAX_VALUE_IGNORE
        maxDeltaY = MAX_VALUE_IGNORE
        maxDist = MAX_VALUE_IGNORE
        maxDurationMs = DEFAULT_MAX_DURATION_MS
        maxDelayMs = DEFAULT_MAX_DELAY_MS
        numberOfTaps = DEFAULT_NUMBER_OF_TAPS
        minNumberOfPointers = DEFAULT_MIN_NUMBER_OF_POINTERS
        shouldCancelWhenOutside = DEFAULT_SHOULD_CANCEL_WHEN_OUTSIDE
    }

    private fun startTap() {
        handler.removeCallbacksAndMessages(null)
        handler.postDelayed(failDelayed, maxDurationMs)
    }

    private fun endTap() {
        handler.removeCallbacksAndMessages(null)
        if (++tapsSoFar == numberOfTaps && currentMaxNumberOfPointers >= minNumberOfPointers) {
            activate()
        } else {
            handler.postDelayed(failDelayed, maxDelayMs)
        }
    }

    private fun shouldFail(): Boolean {
        val dx = lastX - startX + offsetX
        if (maxDeltaX != MAX_VALUE_IGNORE && abs(dx) > maxDeltaX) {
            return true
        }
        val dy = lastY - startY + offsetY
        if (maxDeltaY != MAX_VALUE_IGNORE && abs(dy) > maxDeltaY) {
            return true
        }
        val dist = dy * dy + dx * dx
        return maxDist != MAX_VALUE_IGNORE && dist > maxDist * maxDist
    }

    override fun initialize(event: MotionEvent, sourceEvent: MotionEvent) {
        offsetX = 0f
        offsetY = 0f
        startX = getLastPointerX(sourceEvent, true)
        startY = getLastPointerY(sourceEvent, true)
    }

    override fun onHandle(event: MotionEvent, sourceEvent: MotionEvent) {
        val state = state
        val action = sourceEvent.actionMasked
        if (state == STATE_UNDETERMINED) {
            initialize(event, sourceEvent)
        }
        if (action == MotionEvent.ACTION_POINTER_UP || action == MotionEvent.ACTION_POINTER_DOWN) {
            offsetX += lastX - startX
            offsetY += lastY - startY
            lastX = getLastPointerX(sourceEvent, true)
            lastY = getLastPointerY(sourceEvent, true)
            startX = lastX
            startY = lastY
        } else {
            lastX = getLastPointerX(sourceEvent, true)
            lastY = getLastPointerY(sourceEvent, true)
        }
        if (currentMaxNumberOfPointers < sourceEvent.pointerCount) {
            currentMaxNumberOfPointers = sourceEvent.pointerCount
        }
        if (shouldFail()) {
            fail()
        } else if (state == STATE_UNDETERMINED) {
            if (action == MotionEvent.ACTION_DOWN) {
                begin()
            }
            startTap()
        } else if (state == STATE_BEGAN) {
            if (action == MotionEvent.ACTION_UP) {
                endTap()
            } else if (action == MotionEvent.ACTION_DOWN) {
                startTap()
            }
        }
    }

    override fun activate() {
        super.activate()
        end()
    }

    override fun onCancel() {
        handler.removeCallbacksAndMessages(null)
    }

    override fun onReset() {
        tapsSoFar = 0
        currentMaxNumberOfPointers = 0
        handler.removeCallbacksAndMessages(null)
    }

    override fun updateConfig(config: GestureConfig) {
        super.updateConfig(config)
        if (config.has(KEY_NUMBER_OF_TAPS)) {
            numberOfTaps = config.int(KEY_NUMBER_OF_TAPS)
        }
        if (config.has(KEY_MAX_DURATION_MS)) {
            maxDurationMs = config.long(KEY_MAX_DURATION_MS)
        }
        if (config.has(KEY_MAX_DELAY_MS)) {
            maxDelayMs = config.long(KEY_MAX_DELAY_MS)
        }
        if (config.has(KEY_MAX_DELTA_X)) {
            maxDeltaX = config.px(KEY_MAX_DELTA_X)
        }
        if (config.has(KEY_MAX_DELTA_Y)) {
            maxDeltaY = config.px(KEY_MAX_DELTA_Y)
        }
        if (config.has(KEY_MAX_DIST)) {
            maxDist = config.px(KEY_MAX_DIST)
        }
        if (config.has(KEY_MIN_POINTERS)) {
            minNumberOfPointers = config.int(KEY_MIN_POINTERS)
        }
    }

    override fun buildEventData(eventData: GestureEventData, density: Float) {
        super.buildEventData(eventData, density)

        eventData.x = (lastRelativePositionX / density).toDouble()
        eventData.y = (lastRelativePositionY / density).toDouble()
        eventData.absoluteX = (lastPositionInWindowX / density).toDouble()
        eventData.absoluteY = (lastPositionInWindowY / density).toDouble()
    }

    companion object {
        private const val MAX_VALUE_IGNORE = Float.MIN_VALUE
        private const val DEFAULT_MAX_DURATION_MS: Long = 500
        private const val DEFAULT_MAX_DELAY_MS: Long = 200
        private const val DEFAULT_NUMBER_OF_TAPS = 1
        private const val DEFAULT_MIN_NUMBER_OF_POINTERS = 1
        private const val DEFAULT_SHOULD_CANCEL_WHEN_OUTSIDE = true

        private const val KEY_NUMBER_OF_TAPS = "numberOfTaps"
        private const val KEY_MAX_DURATION_MS = "maxDurationMs"
        private const val KEY_MAX_DELAY_MS = "maxDelayMs"
        private const val KEY_MAX_DELTA_X = "maxDeltaX"
        private const val KEY_MAX_DELTA_Y = "maxDeltaY"
        private const val KEY_MAX_DIST = "maxDist"
        private const val KEY_MIN_POINTERS = "minPointers"
    }
}
