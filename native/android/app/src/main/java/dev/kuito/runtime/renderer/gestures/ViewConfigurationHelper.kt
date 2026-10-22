// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/android/src/main/java/com/swmansion/gesturehandler/core/ViewConfigurationHelper.kt
// and .../react/RNViewConfigurationHelper.kt),
// MIT License, Copyright (c) 2016 Software Mansion.
package dev.kuito.runtime.renderer.gestures

import android.view.View
import android.view.ViewGroup

/** How the orchestrator sees a view while it looks for the handlers under a touch. */
internal object ViewConfigurationHelper {
    fun getPointerEventsConfigForView(view: View): PointerEventsConfig {
        // Views that are disabled should never be the target of pointer events. However, their children
        // can be because some views (SwipeRefreshLayout) use enabled but still have children that can
        // be valid targets.
        if (!view.isEnabled) {
            return PointerEventsConfig.BOX_NONE
        }

        return PointerEventsConfig.AUTO
    }

    // Kuito unclips every container unless `overflow: hidden`; a scroll view clips its content.
    fun isViewClippingChildren(view: ViewGroup) = view.clipChildren
}
