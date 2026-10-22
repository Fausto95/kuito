package dev.kuito.runtime.renderer.gestures

import android.os.Looper

/**
 * Every gesture of one renderer by tag, in shared C++
 * (native/shared/gestures/GestureArbiter.h): the relations between them and
 * each one's state. A gesture changes state only while an arbiter has it in
 * its stream. Closing closes its arbiters, then frees the table. UI thread only.
 */
internal class GestureTable : AutoCloseable {
    private var handle = nativeCreate()
    private val arbiters = mutableListOf<GestureArbiter>()

    /** Which gesture waits for or runs alongside which (native/shared/gestures/GestureRelations.h). */
    inner class Relations {
        /** Replaces all three of the gesture's relations: one left empty is none. */
        fun set(tag: Int, waitFor: IntArray, simultaneous: IntArray, blocks: IntArray) =
            nativeSetRelations(live(), tag, waitFor, simultaneous, blocks)

        /** [gesture] waits for [other] to fail: it names [other] in waitFor, or [other] names it in blocks. */
        fun waitsFor(gesture: Int, other: Int): Boolean = nativeWaitsFor(live(), gesture, other)

        /** Either names the other in simultaneous; a gesture runs alongside itself. */
        fun simultaneous(a: Int, b: Int): Boolean = nativeSimultaneous(live(), a, b)
    }

    val relations = Relations()

    /** The gesture's last state; UNDETERMINED for one the table never had. */
    fun state(tag: Int): Int = nativeState(live(), tag)

    // RNGH's guarded changes: each is a no-op from a state it does not leave.
    fun begin(tag: Int) = change(tag, BEGIN)
    fun activate(tag: Int) = change(tag, ACTIVATE)
    fun end(tag: Int) = change(tag, END)
    fun fail(tag: Int) = change(tag, FAIL)
    fun cancel(tag: Int) = change(tag, CANCEL)

    /** The gesture is gone: it leaves its arbiter's stream, its state and its own relations go. */
    fun drop(tag: Int) = nativeDrop(live(), tag)

    /** An arbiter for one root of touches, closed with the table if not before. */
    fun arbiter(host: GestureArbiter.Host): GestureArbiter = GestureArbiter(live(), host) { arbiters.remove(it) }.also { arbiters.add(it) }

    override fun close() {
        if (handle == 0L) return
        arbiters.toList().forEach { it.close() }
        check(nativeDestroy(handle)) { "A gesture arbiter outlived its table" }
        handle = 0L
    }

    private fun change(tag: Int, change: Int) {
        check(Looper.myLooper() == Looper.getMainLooper()) { "Gesture handlers run on the UI thread" }
        nativeChange(live(), tag, change)
    }

    private fun live(): Long = handle.also { check(it != 0L) { "Gesture table used after close" } }

    private external fun nativeCreate(): Long
    private external fun nativeDestroy(handle: Long): Boolean
    private external fun nativeSetRelations(handle: Long, tag: Int, waitFor: IntArray, simultaneous: IntArray, blocks: IntArray)
    private external fun nativeWaitsFor(handle: Long, gesture: Int, other: Int): Boolean
    private external fun nativeSimultaneous(handle: Long, a: Int, b: Int): Boolean
    private external fun nativeState(handle: Long, tag: Int): Int
    private external fun nativeChange(handle: Long, tag: Int, change: Int)
    private external fun nativeDrop(handle: Long, tag: Int)

    private companion object {
        // KuitoGesturesJNI.cpp's nativeChange numbers.
        const val BEGIN = 0
        const val ACTIVATE = 1
        const val END = 2
        const val FAIL = 3
        const val CANCEL = 4

        init {
            System.loadLibrary("kuito_mobile")
        }
    }
}
