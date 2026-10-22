package dev.kuito.runtime.renderer

import android.content.Context
import android.os.SystemClock
import android.view.View
import android.widget.FrameLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.kuito.runtime.renderer.layout.KuitoModeMeasured
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Frame receipts (docs/performance.md#frame-receipts): a frame that drops
 * keeps what ran in it, and names the job its layout was for.
 */
@RunWith(AndroidJUnit4::class)
class KuitoFrameReceiptsTest {
    private val interval = 1.0 / 60

    /** A leaf that takes 20 ms to measure. */
    private class SlowLeaf(context: Context) : View(context), KuitoModeMeasured {
        override fun measure(width: Float, widthMode: Int, height: Float, heightMode: Int): Pair<Float, Float> {
            val until = SystemClock.elapsedRealtimeNanos() + 20_000_000L

            while (SystemClock.elapsedRealtimeNanos() < until) Unit

            return 80f to 20f
        }
    }

    private fun onLaidOutText(test: (KuitoAndroidRenderer, FrameLayout) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                KuitoFrameLedger.reset()

                val container = FrameLayout(instrumentation.targetContext)
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, container) { _, _, _ -> false }

                renderer.createView(1, "Text", 0, "title")
                renderer.setProperty(1, "text", KuitoValue.Text("Hello"))
                layOut(container)
                KuitoFrameLedger.frame(0.0, interval)
                test(renderer, container)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    private fun layOut(container: FrameLayout) {
        container.measure(
            View.MeasureSpec.makeMeasureSpec(320, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(640, View.MeasureSpec.EXACTLY),
        )
        container.layout(0, 0, 320, 640)
    }

    @Test
    fun aForcedTwentyMillisecondLayoutLeavesLayoutReceiptsNamingItsJob() = onLaidOutText { renderer, container ->
        val node = checkNotNull(renderer.nodes[1]).layout

        KuitoFrameLedger.woke()
        KuitoFrameLedger.applyJob(42, "press", 1)
        node.view = SlowLeaf(container.context)
        node.markDirty()
        container.getChildAt(0).requestLayout()
        layOut(container)
        KuitoFrameLedger.slept()

        val (_, dropped) = KuitoFrameLedger.frame(3 * interval, interval)
        val receipts = KuitoFrameLedger.lastDropReceipts()
        // The measure inside it has a receipt of its own kind; a pass may
        // calculate the root more than once.
        val slow = receipts.map { it.split(" ") }.filter { it[0] == "layout" && it[1].toDouble() >= 20.0 }

        assertTrue("the frame dropped", dropped > 0)
        assertTrue(receipts.joinToString("\n"), slow.isNotEmpty())
        assertEquals(listOf("42"), slow.map { it[2] }.distinct())

        val line = KuitoFrameLedger.describeLastDrop(renderer::describe)

        assertTrue(line, line.startsWith("Dropped ${dropped.toInt()} frame"))
        assertTrue(line, line.contains("← job 42 (press on Text title (1))"))
    }

    @Test
    fun aFrameOnTimeKeepsNoDrop() = onLaidOutText { renderer, container ->
        KuitoFrameLedger.woke()
        renderer.setProperty(1, "text", KuitoValue.Text("Quick"))
        layOut(container)
        KuitoFrameLedger.slept()

        assertEquals(0.0, KuitoFrameLedger.frame(interval, interval)[1], 0.0)
        assertEquals(0L, KuitoFrameLedger.dropSequence())
    }
}
