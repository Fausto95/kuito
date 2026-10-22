package dev.kuito.runtime.renderer

import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.recyclerview.widget.RecyclerView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.kuito.runtime.renderer.KuitoKeyEdit.Op.INSERT
import dev.kuito.runtime.renderer.KuitoKeyEdit.Op.MOVE
import dev.kuito.runtime.renderer.KuitoKeyEdit.Op.REMOVE
import dev.kuito.runtime.renderer.views.KuitoListView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * A list's keys arrive as edits to the keys it has, applied in order
 * (docs/lists.md#keys); sticky rows follow their keys to their new places.
 */
@RunWith(AndroidJUnit4::class)
class KuitoListKeysTest {
    /** The numbers of each `motion` event the list sent. */
    private val motions = mutableListOf<List<Double>>()

    private fun onList(test: (KuitoAndroidRenderer, KuitoListView) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val container = FrameLayout(instrumentation.targetContext)
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, container) { id, event, record ->
                    if (id == 1 && event == "motion") motions += record.numbers.take(record.count)
                    false
                }

                renderer.createView(1, "List", 0, "list")
                test(renderer, checkNotNull(firstList(container)))
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    private fun KuitoAndroidRenderer.keys(vararg edits: KuitoKeyEdit) =
        setProperty(1, "keys", KuitoValue.Keys(edits.toList()))

    /** The first keys of a list: each inserted at the end. */
    private fun KuitoAndroidRenderer.inserting(vararg keys: String) =
        keys(*keys.mapIndexed { index, key -> KuitoKeyEdit(INSERT, key, index) }.toTypedArray())

    private fun KuitoAndroidRenderer.assertRejected(vararg edits: KuitoKeyEdit, reason: String? = null) {
        val error = assertThrows(edits.joinToString(), KuitoRenderError.UnsupportedValue::class.java) { keys(*edits) }

        assertEquals("keys", error.prop)
        reason?.let { assertTrue(error.message, error.reason.contains(it)) }
    }

    private val KuitoListView.adapter get() = checkNotNull((scroller as RecyclerView).adapter)

    @Test
    fun aListGivenMotionSendsWhereItIs() = onList { renderer, list ->
        renderer.setProperty(1, "emitsMotion", KuitoValue.Bool(true))
        list.motion.frame()

        assertEquals("where it is, at rest", listOf(listOf(0.0, 0.0, 0.0)), motions)
    }

    @Test
    fun editsApplyInOrderToTheKeysTheListHas() = onList { renderer, list ->
        val changes = mutableListOf<String>()

        renderer.inserting("a", "b", "c", "d")
        list.adapter.registerAdapterDataObserver(object : RecyclerView.AdapterDataObserver() {
            override fun onChanged() { changes += "reload" }
            override fun onItemRangeInserted(start: Int, count: Int) { changes += "insert $start" }
            override fun onItemRangeRemoved(start: Int, count: Int) { changes += "remove $start" }
            override fun onItemRangeMoved(from: Int, to: Int, count: Int) { changes += "move $from $to" }
        })
        renderer.keys(KuitoKeyEdit(REMOVE, "b", 1), KuitoKeyEdit(MOVE, "d", 0), KuitoKeyEdit(INSERT, "e", 2))

        assertEquals(listOf("d", "a", "e", "c"), list.keys)
        assertEquals(4, list.adapter.itemCount)
        assertEquals(listOf("remove 1", "move 2 0", "insert 2"), changes)
    }

    @Test
    fun stickyRowsFollowTheirKeysWhenRowsComeAndGoAboveThem() = onList { renderer, list ->
        renderer.inserting(*Array(12) { "k$it" })
        renderer.setProperty(1, "stickyKeys", stringList("k0", "k3"))
        renderer.keys(KuitoKeyEdit(INSERT, "n0", 0), KuitoKeyEdit(INSERT, "n1", 1))

        assertEquals(listOf(2, 5), list.stickyPositions)

        renderer.keys(KuitoKeyEdit(REMOVE, "k0", 2), KuitoKeyEdit(MOVE, "k3", 0))

        assertEquals(listOf(0), list.stickyPositions)
    }

    @Test
    fun anEditThatDoesNotFitTheKeysIsRejectedAndChangesNothing() = onList { renderer, list ->
        renderer.inserting("a")

        renderer.assertRejected(KuitoKeyEdit(INSERT, "b", 1), KuitoKeyEdit(REMOVE, "x", 0))
        renderer.assertRejected(KuitoKeyEdit(REMOVE, "a", 1))
        renderer.assertRejected(KuitoKeyEdit(MOVE, "x", 0))
        renderer.assertRejected(KuitoKeyEdit(MOVE, "a", 1))
        renderer.assertRejected(KuitoKeyEdit(INSERT, "b", 2))

        assertEquals(listOf("a"), list.keys)
        assertEquals(1, list.adapter.itemCount)
    }

    @Test
    fun aDuplicateKeyIsAnUnsupportedValue() = onList { renderer, _ ->
        renderer.inserting("a")

        renderer.assertRejected(KuitoKeyEdit(INSERT, "a", 1), reason = "unique")
    }

    @Test
    fun nullClearsTheKeys() = onList { renderer, list ->
        renderer.inserting("a", "b")
        renderer.setProperty(1, "keys", KuitoValue.Null)

        assertEquals(emptyList<String>(), list.keys)
        assertEquals(0, list.adapter.itemCount)
    }

    @Test
    fun aListRemovedBeforeItsPendingScrollRunsAsksForNoRows() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val events = mutableListOf<String>()

        ActivityScenario.launch(ComponentActivity::class.java).use { scenario ->
            lateinit var renderer: KuitoAndroidRenderer

            scenario.onActivity { activity ->
                val container = FrameLayout(activity)

                activity.setContentView(container)
                renderer = KuitoAndroidRenderer(activity, container) { _, event, _ ->
                    events += event
                    false
                }
                renderer.createView(1, "List", 0, "list")
                renderer.setProperty(1, "width", KuitoValue.Number(320.0))
                renderer.setProperty(1, "height", KuitoValue.Number(400.0))
                renderer.inserting(*Array(20) { "k$it" })
            }
            instrumentation.waitForIdleSync()

            scenario.onActivity {
                assertTrue("the list asked for its first rows", "bind" in events)
                // The edit queues a scroll pass; the list goes before it runs.
                renderer.keys(KuitoKeyEdit(INSERT, "new", 0))
                renderer.removeView(1)
                events.clear()
            }
            instrumentation.waitForIdleSync()
        }

        assertEquals(emptyList<String>(), events.filter { it == "bind" })
    }

    @Test
    fun aRowListClearedBeforeItsPendingSizeRunsLeavesItsNodeAlone() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()

        ActivityScenario.launch(ComponentActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val container = FrameLayout(activity)

                activity.setContentView(container)

                val renderer = KuitoAndroidRenderer(activity, container) { _, _, _ -> false }

                renderer.createView(1, "HorizontalList", 0, "list")
                // A taller row posts a layout of the list's node; the renderer frees it first.
                checkNotNull(firstList(container)).recordSize("k0", 320, 48)
                renderer.clear()
            }
            instrumentation.waitForIdleSync()
        }
    }

    private fun firstList(view: View): KuitoListView? =
        view as? KuitoListView ?: (view as? ViewGroup)?.let { group ->
            (0 until group.childCount).firstNotNullOfOrNull { firstList(group.getChildAt(it)) }
        }
}
