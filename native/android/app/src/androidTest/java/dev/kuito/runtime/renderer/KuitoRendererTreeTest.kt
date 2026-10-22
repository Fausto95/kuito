package dev.kuito.runtime.renderer

import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.kuito.runtime.renderer.views.KuitoPressableLayout
import dev.kuito.runtime.renderer.views.KuitoSafeAreaLayout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * A mutation the tree cannot take is an error naming the view, never a view
 * placed somewhere else or dropped (CLAUDE.md, Errors).
 */
@RunWith(AndroidJUnit4::class)
class KuitoRendererTreeTest {
    private fun onRenderer(test: (KuitoAndroidRenderer) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, FrameLayout(instrumentation.targetContext)) { _, _, _ -> false }

                renderer.createView(BOX, "Box", 0, "box")
                test(renderer)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    private fun invalidTree(mutation: () -> Unit) = assertThrows(KuitoRenderError.InvalidTree::class.java, mutation)

    private fun missingView(mutation: () -> Unit) = assertThrows(KuitoRenderError.MissingView::class.java, mutation)

    @Test
    fun aNumberInUseIsAnInvalidTree() = onRenderer { renderer ->
        invalidTree { renderer.createView(BOX, "Text", 0, "again") }
    }

    @Test
    fun anUnknownKindIsAnInvalidTree() = onRenderer { renderer ->
        invalidTree { renderer.createView(2, "Bogus", BOX, "bogus") }
    }

    @Test
    fun aNavigationScreenOutsideAStackIsAnInvalidTree() = onRenderer { renderer ->
        invalidTree { renderer.createView(2, "NavigationScreen", BOX, "screen") }
    }

    @Test
    fun aViewInsideAStackThatIsNotAScreenIsAnInvalidTree() = onRenderer { renderer ->
        renderer.createView(2, "NavigationStack", BOX, "stack")

        invalidTree { renderer.createView(3, "Box", 2, "loose") }
    }

    @Test
    fun anUnknownParentIsAMissingView() = onRenderer { renderer ->
        missingView { renderer.createView(2, "Box", 99, "orphan") }
    }

    @Test
    fun everyMutationOfAnUnknownViewIsAMissingView() = onRenderer { renderer ->
        missingView { renderer.setProperty(99, "opacity", KuitoValue.Number(1.0)) }
        missingView { renderer.moveView(99, BOX, 0) }
        missingView { renderer.removeView(99) }
        missingView { renderer.setFlattened(99, true) }
        missingView { renderer.command(99, "focus", "") }
    }

    // One record per view

    @Test
    fun aViewsRecordHoldsItsView() = onRenderer { renderer ->
        val record = checkNotNull(renderer.nodes[BOX])

        assertNotNull(record.view?.parent)
        assertSame(record.layout.view, record.view)
    }

    @Test
    fun flatteningChangesOnlyTheRecordsView() = onRenderer { renderer ->
        renderer.createView(2, "Text", BOX, "label")

        val record = checkNotNull(renderer.nodes[BOX])
        val label = checkNotNull(renderer.nodes[2]?.view)

        renderer.setFlattened(BOX, true)

        assertSame("the record stays", record, renderer.nodes[BOX])
        assertNull(record.view)
        assertNotNull("its child keeps its view", label.parent)

        renderer.setFlattened(BOX, false)

        assertSame(record.view, label.parent)
    }

    @Test
    fun aScrollViewsRecordHoldsItsContent() = onRenderer { renderer ->
        renderer.createView(2, "Scroll", BOX, "scroll")
        renderer.createView(3, "Text", 2, "label")

        val scroll = checkNotNull(renderer.nodes[2])
        val content = checkNotNull(scroll.content)

        assertNotSame(scroll.view, content)
        assertSame(content, renderer.nodes[3]?.view?.parent)
    }

    @Test
    fun aSheetsRecordHoldsTheSheet() = onRenderer { renderer ->
        renderer.createView(2, "Sheet", BOX, "sheet")

        val sheet = checkNotNull(renderer.nodes[2])

        assertSame(sheet.view, sheet.sheet)
    }

    @Test
    fun clearingDropsEveryRecord() = onRenderer { renderer ->
        renderer.createView(2, "Text", BOX, "label")

        renderer.clear()

        assertTrue(renderer.nodes.isEmpty())
    }

    /**
     * The devtools' Select on device picks the deepest view the renderer
     * drew, through any view the platform adds on top of them.
     */
    @Test
    fun aPointPicksTheDeepestDrawnViewThroughViewsThePlatformAdded() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val context = instrumentation.targetContext
                val container = FrameLayout(context)
                val renderer = KuitoAndroidRenderer(context, container) { _, _, _ -> false }
                val px = { dp: Float -> dp * context.resources.displayMetrics.density }

                renderer.createView(1, "Box", 0, "screen")
                renderer.setProperty(1, "width", KuitoValue.Number(320.0))
                renderer.setProperty(1, "height", KuitoValue.Number(640.0))
                renderer.createView(2, "Box", 1, "poster")
                renderer.setProperty(2, "width", KuitoValue.Number(100.0))
                renderer.setProperty(2, "height", KuitoValue.Number(100.0))
                container.measure(
                    View.MeasureSpec.makeMeasureSpec(px(320f).toInt(), View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(px(640f).toInt(), View.MeasureSpec.EXACTLY),
                )
                container.layout(0, 0, px(320f).toInt(), px(640f).toInt())

                val screen = checkNotNull(renderer.nodes[1]?.view) as ViewGroup
                val added = View(context)

                screen.addView(added)
                added.layout(0, 0, screen.width, screen.height)

                assertEquals(2, renderer.idAt(px(50f), px(50f)))
                assertEquals(1, renderer.idAt(px(200f), px(300f)))
                assertNull("outside every view", renderer.idAt(px(400f), px(50f)))
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    @Test
    fun containersAreHostsAndViewsThatNeedTheirRecordAreStyled() = onRenderer { renderer ->
        val kinds = listOf("List", "HorizontalList", "NavigationStack", "NavigationTabs", "Pressable", "SafeArea", "Sheet")

        kinds.forEachIndexed { index, kind -> renderer.createView(index + 2, kind, BOX, kind) }

        assertEquals(
            setOf("List", "HorizontalList", "NavigationStack", "NavigationTabs"),
            renderer.nodes.values.filter { it.host != null }.map { it.kind }.toSet(),
        )
        assertSame(renderer.nodes[6], (renderer.nodes[6]?.view as? KuitoPressableLayout)?.style)
        assertSame(renderer.nodes[7], (renderer.nodes[7]?.view as? KuitoSafeAreaLayout)?.style)
        assertNotNull(renderer.nodes[8]?.sheet)
    }

    /** A native module's container is a host like the built-in ones: the renderer hands it its children and asks nothing of its type. */
    @Test
    fun aModuleContainerHostsItsChildren() = onRenderer { renderer ->
        val host = RecordingHost(InstrumentationRegistry.getInstrumentation().targetContext)

        KuitoModuleViews.register("module:TestHost", KuitoModuleViewKind({ _, _, _ -> host }, emptyMap()))
        renderer.createView(2, "module:TestHost", BOX, "host")
        renderer.createView(3, "Box", 2, "a")
        renderer.createView(4, "Box", 2, "b")
        renderer.moveView(4, 2, 0)
        renderer.removeView(3)

        assertEquals(listOf("adopt a", "adopt b", "move b 0", "release a"), host.calls)
        assertNull("released at once: gone without a transition", renderer.nodes[3])
        assertThrows(KuitoRenderError.InvalidTree::class.java) { renderer.moveView(4, BOX, 0) }
    }

    /** A module container that records what the renderer asks of it. */
    private class RecordingHost(context: Context) : View(context), KuitoHost {
        val calls = mutableListOf<String>()
        private val labels = mutableMapOf<View, String>()

        override fun adopt(child: View, label: String, index: Int?) {
            labels[child] = label
            calls += "adopt $label"
        }

        override fun move(child: View, index: Int) {
            calls += "move ${labels[child]} $index"
        }

        override fun release(child: View, gone: () -> Unit) {
            calls += "release ${labels[child]}"
            gone()
        }

        override fun animatesRemoval(child: View) = false
    }

    private companion object {
        const val BOX = 1
    }
}
