package dev.kuito.runtime.renderer.accessibility

import android.content.Context
import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityManager
import android.view.accessibility.AccessibilityNodeInfo
import dev.kuito.runtime.renderer.KuitoAccessibilityStatusPayload
import dev.kuito.runtime.renderer.KuitoEventEmitter
import dev.kuito.runtime.renderer.KuitoRenderError
import org.json.JSONObject

/**
 * App-wide accessibility: TalkBack and Remove Animations status, reported as
 * the app's `accessibility.status` event when asked and on every change;
 * announcements; and screen reader focus.
 */
internal class KuitoAccessibilityMonitor(private val root: View, private val events: KuitoEventEmitter) {
    private val manager = root.context.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager

    init {
        manager.addTouchExplorationStateChangeListener { sendStatus() }
        root.context.contentResolver.registerContentObserver(
            Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE),
            false,
            object : ContentObserver(Handler(Looper.getMainLooper())) {
                override fun onChange(selfChange: Boolean) = sendStatus()
            },
        )
    }

    fun sendStatus() {
        events.emit(0, "accessibility.status", KuitoAccessibilityStatusPayload(
            screenReaderEnabled = manager.isTouchExplorationEnabled,
            // Remove Animations sets the animator scale to 0, as React Native reads it.
            reduceMotionEnabled = Settings.Global.getFloat(root.context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f,
        ))
    }

    /** `{ message, queue }`; TalkBack always queues, so `queue` changes nothing here. */
    fun announce(argument: String) {
        val message = runCatching { JSONObject(argument).optString("message") }.getOrNull()?.takeIf { it.isNotEmpty() }
            ?: throw KuitoRenderError.Rejection("expects { message, queue? }")

        @Suppress("DEPRECATION") // The replacement, live regions, needs a view per message.
        root.announceForAccessibility(message)
    }

    fun focus(view: View) {
        view.performAccessibilityAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null)
        view.sendAccessibilityEvent(AccessibilityEvent.TYPE_VIEW_FOCUSED)
    }
}
