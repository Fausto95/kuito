// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/android/src/main/java/com/swmansion/gesturehandler/react/events/RNGestureHandlerEventDispatcher.kt,
// .../RNGestureHandlerEvent.kt and .../RNGestureHandlerStateChangeEvent.kt),
// MIT License, Copyright (c) 2016 Software Mansion.
package dev.kuito.runtime.renderer.gestures

import android.view.MotionEvent
import dev.kuito.runtime.renderer.KuitoGesturePayload

/**
 * Turns a view's handler callbacks into `gesture` event payloads: a state
 * change carries `oldState`, an update (while ACTIVE) does not.
 */
internal class GestureHandlerEventDispatcher(
    private val density: Float,
    private val emit: (KuitoGesturePayload) -> Unit,
) : OnTouchEventListener {
    override fun onHandlerUpdate(handler: GestureHandler, event: MotionEvent) {
        // triggers onUpdate and onChange callbacks on the JS side

        // root containers use negative tags, we don't need to dispatch events for them to the JS
        if (handler.tag < 0 || handler.state != GestureHandler.STATE_ACTIVE) {
            return
        }

        emit(eventData(handler).payload(handler.tag, handler.state, oldState = null))
    }

    override fun onStateChange(handler: GestureHandler, newState: Int, oldState: Int) {
        // triggers onBegin, onStart, onEnd, onFinalize callbacks on the JS side

        // root containers use negative tags, we don't need to dispatch events for them to the JS
        if (handler.tag < 0) {
            return
        }

        emit(eventData(handler).payload(handler.tag, newState, oldState))
    }

    private fun eventData(handler: GestureHandler) = GestureEventData().also { handler.buildEventData(it, density) }
}

/**
 * The fields a handler reports, filled by its buildEventData; a field its kind
 * does not report stays null and is absent from the payload.
 */
internal class GestureEventData {
    var numberOfPointers = 0
    var pointerType = 0
    var x: Double? = null
    var y: Double? = null
    var absoluteX: Double? = null
    var absoluteY: Double? = null
    var translationX: Double? = null
    var translationY: Double? = null
    var velocityX: Double? = null
    var velocityY: Double? = null
    var scale: Double? = null
    var focalX: Double? = null
    var focalY: Double? = null
    var rotation: Double? = null
    var anchorX: Double? = null
    var anchorY: Double? = null
    var velocity: Double? = null
    var duration: Double? = null

    // RNGH reports a focal point or anchor as NaN until it is known: a value
    // that is not finite is left absent.
    fun payload(handlerTag: Int, state: Int, oldState: Int?) = KuitoGesturePayload(
        handlerTag = handlerTag.toDouble(),
        state = state.toDouble(),
        oldState = oldState?.toDouble(),
        numberOfPointers = numberOfPointers.toDouble(),
        pointerType = pointerType.toDouble(),
        x = x.finite(),
        y = y.finite(),
        absoluteX = absoluteX.finite(),
        absoluteY = absoluteY.finite(),
        translationX = translationX.finite(),
        translationY = translationY.finite(),
        velocityX = velocityX.finite(),
        velocityY = velocityY.finite(),
        scale = scale.finite(),
        focalX = focalX.finite(),
        focalY = focalY.finite(),
        rotation = rotation.finite(),
        anchorX = anchorX.finite(),
        anchorY = anchorY.finite(),
        velocity = velocity.finite(),
        duration = duration.finite(),
    )

    private fun Double?.finite() = this?.takeIf { it.isFinite() }
}
