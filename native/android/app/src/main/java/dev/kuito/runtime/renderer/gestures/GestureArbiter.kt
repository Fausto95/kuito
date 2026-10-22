package dev.kuito.runtime.renderer.gestures

/**
 * The shared arbiter of one root of touches (native/shared/gestures/GestureArbiter.h):
 * which gesture activates, waits for another or is cancelled, and which
 * state changes the app hears. The orchestrator finds the gestures under each
 * pointer and delivers the stream in [order]; the arbiter calls back through
 * [Host] for what only the views and recognizers know. UI thread only.
 */
internal class GestureArbiter(table: Long, private val host: Host, private val closed: (GestureArbiter) -> Unit) : AutoCloseable {
    interface Host {
        fun sharePointers(a: Int, b: Int): Boolean
        /** [gesture]'s view is a descendant of [other]'s. */
        fun inside(gesture: Int, other: Int): Boolean
        fun cancelling(tag: Int)
        fun changed(tag: Int, newState: Int, oldState: Int)
        fun send(tag: Int, newState: Int, oldState: Int)
        /** The gesture left the stream. */
        fun reset(tag: Int)
    }

    private var handle = nativeCreate(table)

    /** The gesture joins the stream from UNDETERMINED, unless it is in it already. */
    fun record(tag: Int) = nativeRecord(live(), tag)
    fun recorded(tag: Int): Boolean = nativeRecorded(live(), tag)

    /** Active gestures first, then awaiting ones, each the latest first, then the rest as recorded. */
    fun order(): IntArray = nativeOrder(live())
    fun awaiting(tag: Int): Boolean = nativeAwaiting(live(), tag)
    fun active(tag: Int): Boolean = nativeActive(live(), tag)

    /** True once after the gesture is let through to activate: its progress restarts. */
    fun takeResetProgress(tag: Int): Boolean = nativeTakeResetProgress(live(), tag)
    fun anyActive(): Boolean = nativeAnyActive(live())

    /** Around one event's delivery: finished gestures leave the stream after it. */
    fun beginTouch() = nativeBeginTouch(live())
    fun endTouch() = nativeEndTouch(live())

    /** The stream was cancelled: every gesture is. */
    fun cancelAll() = nativeCancelAll(live())

    /** A native view took the touch: the app's gestures give it up. */
    fun cancelApp() = nativeCancelApp(live())

    /** Frees the arbiter even when a recognizer throws as it is reset. */
    override fun close() {
        if (handle == 0L) return
        val freed = handle
        handle = 0L
        closed(this)
        nativeDestroy(freed)
    }

    private fun live(): Long = handle.also { check(it != 0L) { "Gesture arbiter used after close" } }

    // Called by KuitoGesturesJNI.cpp; proguard-rules.pro keeps them.
    private fun onSharePointers(a: Int, b: Int) = host.sharePointers(a, b)
    private fun onInside(gesture: Int, other: Int) = host.inside(gesture, other)
    private fun onCancelling(tag: Int) = host.cancelling(tag)
    private fun onChanged(tag: Int, newState: Int, oldState: Int) = host.changed(tag, newState, oldState)
    private fun onSend(tag: Int, newState: Int, oldState: Int) = host.send(tag, newState, oldState)
    private fun onReset(tag: Int) = host.reset(tag)

    private external fun nativeCreate(table: Long): Long
    private external fun nativeDestroy(handle: Long)
    private external fun nativeRecord(handle: Long, tag: Int)
    private external fun nativeRecorded(handle: Long, tag: Int): Boolean
    private external fun nativeOrder(handle: Long): IntArray
    private external fun nativeAwaiting(handle: Long, tag: Int): Boolean
    private external fun nativeActive(handle: Long, tag: Int): Boolean
    private external fun nativeTakeResetProgress(handle: Long, tag: Int): Boolean
    private external fun nativeAnyActive(handle: Long): Boolean
    private external fun nativeBeginTouch(handle: Long)
    private external fun nativeEndTouch(handle: Long)
    private external fun nativeCancelAll(handle: Long)
    private external fun nativeCancelApp(handle: Long)
}
