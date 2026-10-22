// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/android/src/main/java/com/swmansion/gesturehandler/core/DiagonalDirections.kt),
// MIT License, Copyright (c) 2016 Software Mansion.
package dev.kuito.runtime.renderer.gestures

internal object DiagonalDirections {
    const val DIRECTION_RIGHT_UP = GestureHandler.DIRECTION_RIGHT or GestureHandler.DIRECTION_UP
    const val DIRECTION_RIGHT_DOWN = GestureHandler.DIRECTION_RIGHT or GestureHandler.DIRECTION_DOWN
    const val DIRECTION_LEFT_UP = GestureHandler.DIRECTION_LEFT or GestureHandler.DIRECTION_UP
    const val DIRECTION_LEFT_DOWN = GestureHandler.DIRECTION_LEFT or GestureHandler.DIRECTION_DOWN
}
