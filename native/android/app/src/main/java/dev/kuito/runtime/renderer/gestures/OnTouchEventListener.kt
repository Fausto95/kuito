// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/android/src/main/java/com/swmansion/gesturehandler/core/OnTouchEventListener.kt),
// MIT License, Copyright (c) 2016 Software Mansion.
package dev.kuito.runtime.renderer.gestures

import android.view.MotionEvent

internal interface OnTouchEventListener {
    fun onHandlerUpdate(handler: GestureHandler, event: MotionEvent)
    fun onStateChange(handler: GestureHandler, newState: Int, oldState: Int)
}
