package dev.kuito.runtime.devtools

import android.os.SystemClock
import android.os.Trace
import android.view.Choreographer
import android.view.View
import android.view.ViewGroup
import dev.kuito.runtime.renderer.KuitoAndroidRenderer
import dev.kuito.runtime.renderer.KuitoCost
import dev.kuito.runtime.renderer.KuitoDevtoolsOverlay
import dev.kuito.runtime.renderer.KuitoFrameLedger
import java.util.Locale
import kotlin.math.ceil

/**
 * Cost replay (docs/devtools.md#cost-replay): a recording's batches applied to
 * the real renderer on the main thread with no JS, each on the first display
 * frame at or after the time its runtime sent it, then measured and laid out
 * as the frame's traversal would. What a frame costs here is the renderer and
 * layout share of the frame the device drew. The replay also counts its work
 * (docs/performance.md#cost-counters) and keeps the receipts of the frames it
 * dropped (#frame-receipts), by the rule the shells report drops by.
 */
internal class KuitoCostReplay private constructor(
    private val name: String,
    private val batches: List<KuitoReplayBatch>,
    private val renderer: KuitoAndroidRenderer,
    private val container: ViewGroup,
    private val done: (Result<Report>) -> Unit,
) : Choreographer.FrameCallback {
    /** A display frame that applied batches: how many, and what applying and laying them out took. */
    data class Frame(val batches: Int, val records: Int, val workMs: Double)

    /**
     * [cost] is the work the replay did, in counts; [dropped] the display frames
     * dropped while it worked past one; [drops] each drop Kuito's work took the
     * time of, as its receipts describe it.
     */
    data class Report(
        val name: String,
        val frames: List<Frame>,
        val intervalMs: Double,
        val cost: KuitoCost,
        val dropped: Int,
        val drops: List<String>,
    ) {
        val batches get() = frames.sumOf { it.batches }
        val records get() = frames.sumOf { it.records }

        /** Frames whose work alone outlasted the display's interval. */
        val overBudget get() = frames.count { it.workMs > intervalMs }

        /** The frame work at [percent], nearest rank, in milliseconds. */
        fun percentile(percent: Double): Double {
            val sorted = frames.map { it.workMs }.sorted()

            if (sorted.isEmpty()) return 0.0

            return sorted[(ceil(percent / 100 * sorted.size).toInt() - 1).coerceIn(0, sorted.size - 1)]
        }

        /** One line scripts/bisect-frame-cost.ts reads; times in milliseconds. */
        val line: String
            get() {
                val ms = { value: Double -> String.format(Locale.ROOT, "%.2f", value) }

                return "kuito-cost-replay android $name batches=$batches records=$records frames=${frames.size} " +
                    "p50=${ms(percentile(50.0))} p95=${ms(percentile(95.0))} max=${ms(percentile(100.0))} " +
                    "over=$overBudget interval=${ms(intervalMs)} dropped=$dropped " +
                    with(cost) {
                        listOf(
                            "recordsApplied" to recordsApplied, "propWrites" to propWrites,
                            "wastedPropWrites" to wastedPropWrites, "layoutPasses" to layoutPasses,
                            "wastedLayoutPasses" to wastedLayoutPasses, "nodesLaidOut" to nodesLaidOut,
                            "nodesFramed" to nodesFramed, "wastedFrames" to wastedFrames, "measureCalls" to measureCalls,
                            "wastedMeasures" to wastedMeasures, "labelRedraws" to labelRedraws,
                            "wastedRedraws" to wastedRedraws, "viewsCreated" to viewsCreated,
                        ).joinToString(" ") { (key, value) -> "$key=$value" }
                    }
            }
    }

    /**
     * A development build's recording carries devtools commands: the replay takes
     * them as a shell with update highlights off does, drawing nothing.
     */
    private object Devtools : KuitoDevtoolsOverlay {
        override fun highlight(views: List<View>) {}
        override fun inspect(enabled: Boolean) {}
        override fun hello() {}
        override fun cause(view: View, text: String) {}
    }

    init {
        renderer.devtools = Devtools
        KuitoFrameLedger.reset()
    }

    private var next = 0
    private var start = -1L
    private val frames = mutableListOf<Frame>()
    private val before = KuitoCost.total
    private var ticked = false
    private var dropped = 0
    private val drops = mutableListOf<String>()
    private val intervalMs get() = 1000.0 / (container.display?.refreshRate ?: 60f)

    override fun doFrame(frameTimeNanos: Long) {
        closeFrame(frameTimeNanos / 1e9)
        // The frame after the last batch's only closes it.
        if (next == batches.size) return done(Result.success(report()))

        val now = SystemClock.uptimeMillis()
        val first = batches.firstOrNull()?.ms ?: 0.0

        if (start < 0) start = now

        val elapsed = (now - start).toDouble()
        val began = System.nanoTime()
        var applied = 0
        var records = 0

        Trace.beginSection("Kuito replay frame")
        KuitoFrameLedger.woke()
        try {
            while (next < batches.size && batches[next].ms - first <= elapsed) {
                val batch = batches[next].batch

                for (index in 0 until batch.size) renderer.apply(batch, index)
                applied += 1
                records += batch.size
                next += 1
            }
            if (applied > 0) {
                container.measure(
                    View.MeasureSpec.makeMeasureSpec(container.width, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(container.height, View.MeasureSpec.EXACTLY),
                )
                container.layout(container.left, container.top, container.right, container.bottom)
            }
        } catch (error: Throwable) {
            return done(Result.failure(error))
        } finally {
            KuitoFrameLedger.slept()
            Trace.endSection()
        }

        if (applied > 0) frames += Frame(applied, records, (System.nanoTime() - began) / 1e6)
        Choreographer.getInstance().postFrameCallback(this)
    }

    /** The frame rule's verdict on the frame before the vsync at [vsync], in seconds. */
    private fun closeFrame(vsync: Double) {
        val frameDropped = KuitoFrameLedger.frame(vsync, intervalMs / 1000)[1].toInt()

        if (ticked && frameDropped > 0) {
            dropped += frameDropped
            if (KuitoFrameLedger.lastDropReceipted()) drops += KuitoFrameLedger.describeLastDrop(renderer::describe)
        }
        ticked = true
    }

    private fun report() = Report(name, frames, intervalMs, KuitoCost.total - before, dropped, drops)

    companion object {
        /**
         * Replays [batches] into [renderer], whose views lay out in [container], and
         * calls [done] on the main thread with the report, or the error of a record
         * the renderer refused. Main thread, once [container] is laid out.
         */
        fun run(
            name: String,
            batches: List<KuitoReplayBatch>,
            renderer: KuitoAndroidRenderer,
            container: ViewGroup,
            done: (Result<Report>) -> Unit,
        ) {
            check(container.isLaidOut) { "a replay lays out in a container that is laid out" }
            Choreographer.getInstance().postFrameCallback(KuitoCostReplay(name, batches, renderer, container, done))
        }
    }
}
