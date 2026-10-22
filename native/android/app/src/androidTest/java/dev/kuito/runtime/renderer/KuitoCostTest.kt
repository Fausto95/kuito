package dev.kuito.runtime.renderer

import android.util.Log
import android.view.Choreographer
import android.view.View
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TestName
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * The renderer's cost counters (docs/performance.md#cost-counters): wasted
 * work is found, and an interaction's cost stays within its budget. A budget
 * in [expectOverBudget] states the count a fix in the frame-drops plan must
 * reach; once it does, the expectation fails and the budget is tightened.
 */
@RunWith(AndroidJUnit4::class)
class KuitoCostTest {
    @get:Rule
    val test = TestName()

    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private lateinit var scenario: ActivityScenario<ComponentActivity>
    private lateinit var renderer: KuitoAndroidRenderer

    @Before
    fun launch() {
        scenario = ActivityScenario.launch(ComponentActivity::class.java)
        scenario.onActivity { activity ->
            val container = FrameLayout(activity)

            activity.setContentView(container)
            renderer = KuitoAndroidRenderer(activity, container) { _, _, _ -> false }
        }
        frames()
    }

    @After
    fun close() = scenario.close()

    /** A Pressable with a label, then 100 labels: the screen S1 taps. */
    private fun feed() {
        onMain {
            renderer.createView(1, "Pressable", 0, "like")
            // A button has its color from the start, as Reel's do: a view's first
            // background lays out once on Android (docs/native-renderer.md#prop-effects).
            renderer.setProperty(1, "backgroundColor", KuitoValue.Color(0x2a2a2aff))
            renderer.createView(2, "Text", 1, "like-label")
            renderer.setProperty(2, "text", KuitoValue.Text("Like"))
            renderer.createView(3, "VStack", 0, "labels")
            for (index in 0 until 100) {
                renderer.createView(10 + index, "Text", 3, "label-$index")
                renderer.setProperty(10 + index, "text", KuitoValue.Text("Label $index"))
            }
        }
        frames()
    }

    @Test
    fun theSameColorTwiceIsOneEffectiveWriteAndOneWasted() {
        onMain { renderer.createView(1, "Box", 0, "box") }

        val cost = costOf {
            renderer.setProperty(1, "backgroundColor", KuitoValue.Color(0xff0000ff.toInt()))
            renderer.setProperty(1, "backgroundColor", KuitoValue.Color(0xff0000ff.toInt()))
        }

        assertEquals(2L, cost.propWrites)
        assertEquals(1L, cost.wastedPropWrites)
        assertEquals(2L, cost.recordsApplied)
    }

    @Test
    fun aLayoutWithNoChangeSetsNoFrame() {
        feed()

        // The root lays its tree out again; its children, not forced, keep their own layout.
        val cost = costOf { (checkNotNull(renderer.nodes[3]?.view).parent as View).requestLayout() }

        assertTrue("a pass ran", cost.layoutPasses >= 1)
        assertEquals(cost.layoutPasses, cost.wastedLayoutPasses)
        assertTrue("the root placed its views again", cost.nodesFramed > 0)
        assertEquals(cost.nodesFramed, cost.wastedFrames)
    }

    @Test
    fun aNewTextRedrawsItsLabelAndARedrawOfTheSameIsWasted() {
        feed()

        val changed = costOf { renderer.setProperty(60, "text", KuitoValue.Text("Renamed")) }

        assertEquals(1L, changed.labelRedraws)
        assertEquals(0L, changed.wastedRedraws)
        assertTrue("the label measured again", changed.measureCalls > 0)

        val again = costOf { checkNotNull(renderer.nodes[60]?.view).invalidate() }

        assertEquals(1L, again.labelRedraws)
        assertEquals(1L, again.wastedRedraws)
    }

    @Test
    fun creatingAViewCountsIt() {
        val cost = costOf {
            renderer.createView(1, "Box", 0, "box")
            renderer.createView(2, "VStack", 1, "flat", flattened = true)
        }

        assertEquals(1L, cost.viewsCreated)
        assertEquals(2L, cost.recordsApplied)
    }

    @Test
    fun toStayWithinNamesEveryCounterOverBudget() {
        feed()

        val cost = costOf { renderer.setProperty(60, "text", KuitoValue.Text("Renamed")) }
        val over = assertThrows(AssertionError::class.java) {
            cost.toStayWithin("measureCalls" to 0, "nodesFramed" to 0, "viewsCreated" to 0)
        }

        assertTrue(over.message, over.message.orEmpty().contains("measureCalls") && over.message.orEmpty().contains("nodesFramed"))
    }

    // Budgets (kuito-frame-drops-novel-plan.md, D3).

    @Test
    fun s1APaintOnlyTapCreatesNoViewAndRedrawsAtMostOneLabel() {
        feed()

        val cost = costOf { renderer.setProperty(1, "backgroundColor", KuitoValue.Color(0xe50914ff.toInt())) }

        cost.toStayWithin("labelRedraws" to 1, "viewsCreated" to 0, "measureCalls" to 0)
    }

    /** A paint-only write marks no layout (docs/native-renderer.md#prop-effects). */
    @Test
    fun s1APaintOnlyTapLaysNothingOut() {
        feed()

        val cost = costOf { renderer.setProperty(1, "backgroundColor", KuitoValue.Color(0xe50914ff.toInt())) }

        cost.toStayWithin("layoutPasses" to 0, "nodesFramed" to 0)
    }

    /** Target F2 (layout delta journal) and F3 (measure-ahead). */
    @Test
    fun oneLabelsTextAmongAHundredMeasuresOnceAndFramesTwoNodes() {
        feed()

        val cost = costOf { renderer.setProperty(60, "text", KuitoValue.Text("Renamed")) }

        expectOverBudget("target F2, F3: one measure, the label and its parent framed") {
            cost.toStayWithin("measureCalls" to 1, "nodesFramed" to 2, "labelRedraws" to 1)
        }
    }

    @Test
    fun s6AnIdleFrameCostsNothing() {
        feed()

        val cost = costOf {}

        cost.toStayWithin(*cost.counts().map { (name, _) -> name to 0 }.toTypedArray())
    }

    // Support.

    /** What [interaction] cost once the frames after it ran, as the next frames run them. */
    private fun costOf(interaction: () -> Unit): KuitoCost {
        lateinit var before: KuitoCost

        onMain {
            before = KuitoCost.total
            interaction()
        }
        frames()

        lateinit var after: KuitoCost

        onMain { after = KuitoCost.total }

        val cost = after - before

        Log.i("KuitoCost", test.methodName + ": " + cost.counts().joinToString(" ") { (name, count) -> "$name=$count" })

        return cost
    }

    private fun onMain(run: () -> Unit) {
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                run()
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    /**
     * Waits out two display frames: a frame callback runs before that
     * frame's layout and drawing, so the second one runs after the first
     * frame's.
     */
    private fun frames() {
        val done = CountDownLatch(1)

        instrumentation.runOnMainSync {
            Choreographer.getInstance().postFrameCallback {
                Choreographer.getInstance().postFrameCallback { done.countDown() }
            }
        }
        assertTrue("two frames ran within 5 s", done.await(5, TimeUnit.SECONDS))
    }

    private fun expectOverBudget(target: String, check: () -> Unit) {
        assertThrows("$target: the budget holds now, so tighten it", AssertionError::class.java, check)
    }
}

/** The counters by name, as `kuito/tests` names them (docs/performance.md#cost-counters). */
internal fun KuitoCost.counts(): List<Pair<String, Long>> = listOf(
    "recordsApplied" to recordsApplied,
    "propWrites" to propWrites,
    "wastedPropWrites" to wastedPropWrites,
    "layoutPasses" to layoutPasses,
    "wastedLayoutPasses" to wastedLayoutPasses,
    "nodesLaidOut" to nodesLaidOut,
    "nodesFramed" to nodesFramed,
    "wastedFrames" to wastedFrames,
    "measureCalls" to measureCalls,
    "wastedMeasures" to wastedMeasures,
    "labelRedraws" to labelRedraws,
    "wastedRedraws" to wastedRedraws,
    "viewsCreated" to viewsCreated,
)

/** Throws, naming every counter over budget, as `toStayWithin` does headlessly. */
internal fun KuitoCost.toStayWithin(vararg budget: Pair<String, Int>) {
    val counts = counts().toMap()
    val over = budget.sortedBy { it.first }.mapNotNull { (name, most) ->
        val count = counts[name] ?: return@mapNotNull "$name is not a counter"

        if (count > most) "$name $count, budget $most" else null
    }

    if (over.isNotEmpty()) throw AssertionError("Over budget: ${over.joinToString("; ")}")
}
