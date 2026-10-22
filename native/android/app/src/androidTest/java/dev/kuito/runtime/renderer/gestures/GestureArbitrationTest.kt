package dev.kuito.runtime.renderer.gestures

import android.os.SystemClock
import android.view.MotionEvent
import android.view.MotionEvent.PointerCoords
import android.view.MotionEvent.PointerProperties
import android.widget.FrameLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.kuito.runtime.renderer.KuitoGestureConfigEntryValue
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Real recognizers under one root of touches, fed a touch stream: which
 * gesture activates, waits or is cancelled, and the state changes the app
 * hears (docs/motion.md, "Native contract").
 */
@RunWith(AndroidJUnit4::class)
class GestureArbitrationTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val density = context.resources.displayMetrics.density

    /** Each state change as "tag: old -> new"; updates while active are left out. */
    private val sent = mutableListOf<String>()
    private val listener = object : OnTouchEventListener {
        override fun onHandlerUpdate(handler: GestureHandler, event: MotionEvent) {}

        override fun onStateChange(handler: GestureHandler, newState: Int, oldState: Int) {
            if (handler.tag >= 0) sent.add("${handler.tag}: ${NAMES[oldState]} -> ${NAMES[newState]}")
        }
    }

    private class Scene(val registry: GestureHandlerRegistry, val root: FrameLayout, val left: FrameLayout, val right: FrameLayout) {
        val helper = GestureHandlerRootHelper(root, registry)
        val start = SystemClock.uptimeMillis()
    }

    /**
     * A root 400 px wide with two 200 px views side by side, built and fed on
     * the UI thread; `changes` waits for that many state changes, which a
     * recognizer's own timer may send, before the scene goes.
     */
    private fun onScene(changes: Int = 0, test: Scene.() -> Unit) {
        var registry: GestureHandlerRegistry? = null

        try {
            onMain {
                val root = FrameLayout(context)
                val left = FrameLayout(context)
                val right = FrameLayout(context)

                registry = GestureHandlerRegistry()
                root.addView(left, FrameLayout.LayoutParams(200, 200))
                root.addView(right, FrameLayout.LayoutParams(200, 200))
                root.layout(0, 0, 400, 200)
                left.layout(0, 0, 200, 200)
                right.layout(200, 0, 400, 200)
                Scene(checkNotNull(registry), root, left, right).test()
            }
            awaitSent(changes)
        } finally {
            onMain { registry?.close() }
        }
    }

    private fun onMain(work: () -> Unit) {
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                work()
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    /** Polls on the UI thread, up to a deadline, until `sent` has `count` changes. */
    private fun awaitSent(count: Int) {
        val deadline = SystemClock.uptimeMillis() + 2_000
        var size = 0

        while (true) {
            instrumentation.runOnMainSync { size = sent.size }
            if (size >= count || SystemClock.uptimeMillis() > deadline) return
            instrumentation.waitForIdleSync()
        }
    }

    private fun Scene.attach(
        handler: GestureHandler,
        tag: Int,
        view: FrameLayout,
        config: Map<String, Double> = emptyMap(),
        waitFor: IntArray = intArrayOf(),
    ) {
        handler.tag = tag
        registry.registerHandler(handler)
        handler.setConfig(GestureConfig(config.mapValues { KuitoGestureConfigEntryValue.Number(it.value) }, density))
        handler.onTouchEventListener = listener
        registry.relations.set(tag, waitFor, intArrayOf(), intArrayOf())
        registry.attachHandlerToView(tag, view)
    }

    /** Sends one event `time` ms into the scene with each pointer's (id, x, y); `index` is the pointer going down or up. */
    private fun Scene.touch(action: Int, time: Long, vararg pointers: Triple<Int, Float, Float>, index: Int = 0) {
        val properties = pointers.map { (id) -> PointerProperties().apply { this.id = id; toolType = MotionEvent.TOOL_TYPE_FINGER } }
        val coords = pointers.map { (_, x, y) -> PointerCoords().apply { this.x = x; this.y = y } }
        val event = MotionEvent.obtain(
            start, start + time, action or (index shl MotionEvent.ACTION_POINTER_INDEX_SHIFT), pointers.size,
            properties.toTypedArray(), coords.toTypedArray(), 0, 0, 1f, 1f, 0, 0, 0, 0,
        )

        helper.dispatchTouchEvent(event) { false }
        event.recycle()
    }

    private fun finger(x: Float, id: Int = 0) = Triple(id, x, 100f)

    @Test
    fun aDoubleTapCancelsTheTapThatWaitsForIt() = onScene {
        attach(TapGestureHandler(), 1, left, mapOf("numberOfTaps" to 2.0))
        attach(TapGestureHandler(), 2, left, waitFor = intArrayOf(1))

        touch(MotionEvent.ACTION_DOWN, 0, finger(50f))
        touch(MotionEvent.ACTION_UP, 40, finger(50f))
        touch(MotionEvent.ACTION_DOWN, 80, finger(50f))
        touch(MotionEvent.ACTION_UP, 120, finger(50f))

        assertEquals(
            listOf("1: UNDETERMINED -> BEGAN", "2: UNDETERMINED -> BEGAN", "1: BEGAN -> ACTIVE", "2: BEGAN -> CANCELLED", "1: ACTIVE -> END"),
            sent,
        )
    }

    @Test
    fun aTapThatWaitedActivatesWhenTheDoubleTapFails() {
        onScene(changes = 5) {
            attach(TapGestureHandler(), 1, left, mapOf("numberOfTaps" to 2.0, "maxDelayMs" to 50.0))
            attach(TapGestureHandler(), 2, left, waitFor = intArrayOf(1))

            touch(MotionEvent.ACTION_DOWN, 0, finger(50f))
            touch(MotionEvent.ACTION_UP, 40, finger(50f))
        }

        onMain {
            assertEquals(
                listOf("1: UNDETERMINED -> BEGAN", "2: UNDETERMINED -> BEGAN", "2: BEGAN -> ACTIVE", "2: ACTIVE -> END", "1: BEGAN -> FAILED"),
                sent,
            )
        }
    }

    @Test
    fun aPanThatActivatesCancelsATapOnTheSamePointer() = onScene {
        attach(PanGestureHandler(context), 1, left)
        attach(TapGestureHandler(), 2, left)

        touch(MotionEvent.ACTION_DOWN, 0, finger(20f))
        touch(MotionEvent.ACTION_MOVE, 20, finger(120f))
        touch(MotionEvent.ACTION_UP, 40, finger(120f))

        assertEquals(
            listOf("1: UNDETERMINED -> BEGAN", "2: UNDETERMINED -> BEGAN", "2: BEGAN -> CANCELLED", "1: BEGAN -> ACTIVE", "1: ACTIVE -> END"),
            sent,
        )
    }

    @Test
    fun aGestureOnAnotherPointerKeepsRacing() = onScene {
        attach(PanGestureHandler(context), 1, left)
        attach(PanGestureHandler(context), 2, right)

        touch(MotionEvent.ACTION_DOWN, 0, finger(20f))
        touch(MotionEvent.ACTION_POINTER_DOWN, 10, finger(20f), finger(220f, id = 1), index = 1)
        touch(MotionEvent.ACTION_MOVE, 20, finger(120f), finger(320f, id = 1))
        touch(MotionEvent.ACTION_POINTER_UP, 30, finger(120f), finger(320f, id = 1), index = 1)
        touch(MotionEvent.ACTION_UP, 40, finger(120f))

        assertEquals(
            listOf(
                "1: UNDETERMINED -> BEGAN",
                "2: UNDETERMINED -> BEGAN",
                "1: BEGAN -> ACTIVE",
                "2: BEGAN -> ACTIVE",
                "2: ACTIVE -> END",
                "1: ACTIVE -> END",
            ),
            sent,
        )
    }

    // A gesture that never began tells the app nothing when it fails: no
    // onFinalize without onBegin, as on iOS.
    @Test
    fun aGestureThatNeverBeganSendsNoFailure() = onScene {
        attach(PanGestureHandler(context), 1, left, mapOf("minPointers" to 2.0))

        touch(MotionEvent.ACTION_DOWN, 0, finger(20f))
        touch(MotionEvent.ACTION_UP, 20, finger(20f))

        assertEquals(emptyList<String>(), sent)
    }

    // A gesture that waits for one already active does not begin, as on iOS:
    // it could only wait for the other to end and be cancelled.
    @Test
    fun aGestureWaitingForAnActiveOneDoesNotBegin() = onScene {
        attach(PanGestureHandler(context), 1, left)
        attach(PanGestureHandler(context), 2, right, waitFor = intArrayOf(1))

        touch(MotionEvent.ACTION_DOWN, 0, finger(20f))
        touch(MotionEvent.ACTION_MOVE, 20, finger(120f))
        touch(MotionEvent.ACTION_POINTER_DOWN, 30, finger(120f), finger(220f, id = 1), index = 1)
        touch(MotionEvent.ACTION_MOVE, 40, finger(120f), finger(320f, id = 1))
        touch(MotionEvent.ACTION_POINTER_UP, 50, finger(120f), finger(320f, id = 1), index = 1)
        touch(MotionEvent.ACTION_UP, 60, finger(120f))

        assertEquals(listOf("1: UNDETERMINED -> BEGAN", "1: BEGAN -> ACTIVE", "1: ACTIVE -> END"), sent)
    }

    private companion object {
        val NAMES = listOf("UNDETERMINED", "FAILED", "BEGAN", "CANCELLED", "ACTIVE", "END")
    }
}
