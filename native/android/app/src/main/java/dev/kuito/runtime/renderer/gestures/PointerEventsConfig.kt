// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/android/src/main/java/com/swmansion/gesturehandler/core/PointerEventsConfig.kt),
// MIT License, Copyright (c) 2016 Software Mansion.
package dev.kuito.runtime.renderer.gestures

internal enum class PointerEventsConfig {
    /**
     * Neither the container nor its children receive events.
     */
    NONE,

    /**
     * Container doesn't get events but all of its children do.
     */
    BOX_NONE,

    /**
     * Container gets events but none of its children do.
     */
    BOX_ONLY,

    /**
     * Container and all of its children receive touch events (like pointerEvents is unspecified).
     */
    AUTO,
}
