package dev.kuito.runtime.devtools

import android.os.SystemClock
import android.util.Log
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.kuito.runtime.renderer.KuitoAndroidRenderer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Cost replay (docs/devtools.md#cost-replay): the S1–S5 recordings in
 * test/fixtures/recordings/android replay through the renderer with their
 * original timing, and each logs the line scripts/bisect-frame-cost.ts reads
 * (tag KuitoCostReplay). The instrumentation argument `kuitoRecording`, a
 * path on the device, replays one of your own.
 */
@RunWith(AndroidJUnit4::class)
class KuitoCostReplayTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private lateinit var scenario: ActivityScenario<ComponentActivity>
    private lateinit var container: FrameLayout
    private lateinit var renderer: KuitoAndroidRenderer

    @Before
    fun setUp() {
        scenario = ActivityScenario.launch(ComponentActivity::class.java)
        scenario.onActivity { activity ->
            container = FrameLayout(activity)
            activity.setContentView(container)
            renderer = KuitoAndroidRenderer(activity, container) { _, _, _ -> false }
        }
        waitUntil("the container is laid out") { container.isLaidOut }
    }

    @After
    fun tearDown() {
        onMain { renderer.clear() }
        scenario.close()
    }

    private fun <T> onMain(block: () -> T): T {
        var result: Result<T>? = null

        instrumentation.runOnMainSync { result = runCatching(block) }

        return checkNotNull(result).getOrThrow()
    }

    private fun waitUntil(what: String, condition: () -> Boolean) {
        val deadline = SystemClock.uptimeMillis() + 5_000

        while (!onMain(condition)) {
            check(SystemClock.uptimeMillis() < deadline) { "timed out waiting until $what" }
            SystemClock.sleep(10)
        }
    }

    private fun fixture(name: String): ByteArray = instrumentation.context.assets.open("$name.krec").use { it.readBytes() }

    private fun replay(name: String, file: ByteArray): KuitoCostReplay.Report {
        val batches = onMain { KuitoReplayBatch.of(file) }
        val span = (batches.lastOrNull()?.ms ?: 0.0) - (batches.firstOrNull()?.ms ?: 0.0)
        val finished = CountDownLatch(1)
        var result: Result<KuitoCostReplay.Report>? = null

        onMain {
            KuitoCostReplay.run(name, batches, renderer, container) {
                result = it
                finished.countDown()
            }
        }
        check(finished.await(span.toLong() + 30_000, TimeUnit.MILLISECONDS)) { "the replay of $name did not finish" }

        val report = checkNotNull(result).getOrThrow()

        Log.i("KuitoCostReplay", report.line)
        for (drop in report.drops) Log.i("KuitoCostReplay", "kuito-cost-replay android $name $drop")

        return report
    }

    @Test
    fun aReplayAppliesEveryBatchOfItsRecording() {
        val file = fixture("s1-tap")
        val batches = onMain { KuitoReplayBatch.of(file) }
        val report = replay("s1-tap", file)

        assertEquals(batches.size, report.batches)
        assertEquals(batches.sumOf { it.batch.size }, report.records)
        assertFalse("the recording's views are on screen", onMain { renderer.nodes.isEmpty() })
    }

    @Test
    fun aReplayKeepsTheTimeBetweenItsBatches() {
        val file = fixture("s1-tap")
        val batches = onMain { KuitoReplayBatch.of(file) }
        val began = SystemClock.uptimeMillis()

        replay("s1-tap", file)

        assertTrue(SystemClock.uptimeMillis() - began >= batches.last().ms - batches.first().ms)
    }

    /** Counts and drops are what a bisect can judge a replay by without timing's noise. */
    @Test
    fun aReplayCountsItsWorkAndTheFramesItDropped() {
        val report = replay("s1-tap", fixture("s1-tap"))

        assertEquals(report.records.toLong(), report.cost.recordsApplied)
        assertTrue(report.cost.viewsCreated > 0)
        assertTrue(report.cost.nodesFramed > 0)
        assertTrue(report.line, report.line.contains(" dropped=${report.dropped} "))
        assertTrue(report.line, report.line.contains(" nodesFramed=${report.cost.nodesFramed}"))
    }

    @Test
    fun aFileThatIsNotARecordingDoesNotReplay() {
        val error = assertThrows(IllegalStateException::class.java) {
            onMain { KuitoReplayBatch.of("not a recording".toByteArray()) }
        }

        assertTrue(error.message, error.message.orEmpty().contains("KUITO_RECORDING"))
    }

    @Test
    fun costOfS1TapAPressable() {
        replay("s1-tap", fixture("s1-tap"))
    }

    @Test
    fun costOfS2PushAndPopAScreen() {
        replay("s2-push-pop", fixture("s2-push-pop"))
    }

    @Test
    fun costOfS3OpenAndDragASheet() {
        replay("s3-sheet", fixture("s3-sheet"))
    }

    @Test
    fun costOfS4ScrollALongList() {
        replay("s4-scroll", fixture("s4-scroll"))
    }

    @Test
    fun costOfS5TypeInATextField() {
        replay("s5-type", fixture("s5-type"))
    }

    @Test
    fun costOfYourRecording() {
        val path = InstrumentationRegistry.getArguments().getString("kuitoRecording")

        assumeTrue("pass -Pandroid.testInstrumentationRunnerArguments.kuitoRecording=<file.krec>", path != null)

        val file = File(checkNotNull(path))

        replay(file.nameWithoutExtension, file.readBytes())
    }
}
