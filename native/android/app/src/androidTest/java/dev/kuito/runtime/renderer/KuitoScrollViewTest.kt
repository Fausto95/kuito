package dev.kuito.runtime.renderer

import android.graphics.Outline
import android.graphics.drawable.GradientDrawable
import android.view.ViewOutlineProvider
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.kuito.runtime.renderer.views.KuitoScrollSnap
import dev.kuito.runtime.renderer.views.KuitoScrolling
import kotlin.math.roundToInt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * A scroll request lands once the layout has sized the content it came
 * with; paging and snap offsets decide where a drag comes to rest.
 */
@RunWith(AndroidJUnit4::class)
class KuitoScrollViewTest {
    private class Scene(
        val renderer: KuitoAndroidRenderer,
        val container: FrameLayout,
        /** The numbers of each `motion` event the scroll view sent. */
        val motions: List<List<Double>>,
        /** The numbers of each `scrollend` event the scroll view sent. */
        val rests: List<List<Double>>,
    ) {
        val density = container.resources.displayMetrics.density
        val scrolling get() = checkNotNull(renderer.nodes[1]?.view) as KuitoScrolling

        fun px(dp: Float) = (dp * density).roundToInt()

        /** Where `dp` lands on whole pixels, back in dp, as the scroll view reports it. */
        fun onPixels(dp: Float) = (px(dp) / density).toDouble()

        fun layout() {
            container.measure(
                View.MeasureSpec.makeMeasureSpec(px(320f), View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(px(640f), View.MeasureSpec.EXACTLY),
            )
            container.layout(0, 0, px(320f), px(640f))
        }

        fun request(value: KuitoValue) {
            renderer.setProperty(1, "scrollTo", value)
            layout()
        }
    }

    /** A 320×400 scroll view holding 1000 dp of content along its axis. */
    private fun onScroll(kind: String = "Scroll", test: (Scene) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val container = FrameLayout(instrumentation.targetContext)
                val motions = mutableListOf<List<Double>>()
                val rests = mutableListOf<List<Double>>()
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, container) { id, event, record ->
                    if (id == 1 && event == "motion") motions += record.numbers.take(record.count)
                    if (id == 1 && event == "scrollend") rests += record.numbers.take(record.count)
                    false
                }
                val scene = Scene(renderer, container, motions, rests)
                val vertical = kind == "Scroll"

                scene.renderer.createView(1, kind, 0, "scroll")
                scene.renderer.setProperty(1, "width", KuitoValue.Number(320.0))
                scene.renderer.setProperty(1, "height", KuitoValue.Number(400.0))
                // A Scroll grows by default: kept at 400, its end is 600 into 1000 dp.
                scene.renderer.setProperty(1, "flexGrow", KuitoValue.Number(0.0))
                scene.renderer.createView(2, "Box", 1, "content")
                scene.renderer.setProperty(2, if (vertical) "height" else "width", KuitoValue.Number(1000.0))
                scene.renderer.setProperty(2, if (vertical) "width" else "height", KuitoValue.Number(if (vertical) 320.0 else 400.0))
                scene.layout()
                test(scene)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    @Test
    fun anOffsetRequestScrollsThere() = onScroll { scene ->
        scene.request(scrollToOffset(120, animated = false))

        assertEquals(scene.px(120f), scene.scrolling.scroller.scrollY)
    }

    @Test
    fun anOffsetPastTheEndStopsAtTheEnd() = onScroll { scene ->
        scene.request(scrollToOffset(5000, animated = false))

        val scroller = scene.scrolling.scroller

        assertEquals(scene.scrolling.content.height - scroller.height, scroller.scrollY)
    }

    @Test
    fun anEndRequestReachesContentAddedWithIt() = onScroll { scene ->
        scene.renderer.createView(3, "Box", 1, "more")
        scene.renderer.setProperty(3, "height", KuitoValue.Number(500.0))
        scene.request(scrollToEnd(animated = false))

        val scroller = scene.scrolling.scroller

        assertEquals("1500 dp of content in 400", scene.px(1100f).toFloat(), scroller.scrollY.toFloat(), 2f)
        assertEquals(scene.scrolling.content.height - scroller.height, scroller.scrollY)
    }

    @Test
    fun aScrollGivenMotionSendsWhereItIsAsItMovesAndOnceAtRest() = onScroll { scene ->
        val scroller = scene.scrolling.scroller
        var time = 1.0

        scene.scrolling.motion.clock = { time }
        scroller.scrollTo(0, scene.px(10f))
        assertEquals("nothing until the app asks for it", emptyList<List<Double>>(), scene.motions)

        scene.renderer.setProperty(1, "emitsMotion", KuitoValue.Bool(true))
        assertEquals("not inside the batch that asked", emptyList<List<Double>>(), scene.motions)

        scene.scrolling.motion.frame()
        assertEquals("where it is, at rest, on the next frame", listOf(listOf(scene.onPixels(10f), 0.0, 0.0)), scene.motions)

        time = 1.125
        scroller.scrollTo(0, scene.px(110f))
        assertEquals("a first move from rest has no speed yet", 0.0, scene.motions.last()[1], 0.0)

        time = 1.140625
        scroller.scrollTo(0, scene.px(130f))

        val (offset, velocity, overscroll) = scene.motions.last()

        assertEquals(scene.onPixels(130f), offset, 1e-9)
        assertEquals((scene.onPixels(130f) - scene.onPixels(110f)) / 0.015625, velocity, 1e-9)
        assertEquals("Android stretches past an end without moving the content", 0.0, overscroll, 0.0)

        val moving = scene.motions.size

        time = 1.15
        scene.scrolling.motion.frame()
        assertEquals("a frame later it may still be moving", moving, scene.motions.size)

        time = 1.25
        scene.scrolling.motion.frame()
        assertEquals("still for two frames, at rest", listOf(listOf(scene.onPixels(130f), 0.0, 0.0)), scene.motions.drop(moving))
    }

    @Test
    fun aHorizontalScrollSendsItsOffsetAlongItsAxis() = onScroll("HorizontalScroll") { scene ->
        scene.renderer.setProperty(1, "emitsMotion", KuitoValue.Bool(true))
        scene.scrolling.scroller.scrollTo(scene.px(70f), 0)

        assertEquals(scene.onPixels(70f), scene.motions.last().first(), 1e-9)
    }

    @Test
    fun aScrollStopsSendingItsMotionWhenTheAppNoLongerAsks() = onScroll { scene ->
        scene.renderer.setProperty(1, "emitsMotion", KuitoValue.Bool(true))
        scene.scrolling.motion.frame()
        scene.renderer.setProperty(1, "emitsMotion", KuitoValue.Bool(false))
        scene.scrolling.scroller.scrollTo(0, scene.px(40f))
        scene.scrolling.motion.frame()

        assertEquals(1, scene.motions.size)
    }

    @Test
    fun aHorizontalScrollScrollsSideways() = onScroll("HorizontalScroll") { scene ->
        scene.request(scrollToOffset(50, animated = false))

        assertEquals(scene.px(50f), scene.scrolling.scroller.scrollX)
        assertEquals(0, scene.scrolling.scroller.scrollY)
    }

    /** A page is a whole view length, as paging rests: 320 dp across. */
    @Test
    fun aPageRequestScrollsAWholeViewLengthEach() = onScroll("HorizontalScroll") { scene ->
        val scroller = scene.scrolling.scroller

        scene.request(scrollToPage(2, animated = false))
        assertEquals(scene.px(320f) * 2, scroller.scrollX)

        scene.request(scrollToPage(5, animated = false))
        assertEquals("a page past the end stops at the end", scene.scrolling.content.width - scroller.width, scroller.scrollX)
    }

    @Test
    fun itSendsWhereItComesToRest() = onScroll("HorizontalScroll") { scene ->
        val rest = scene.scrolling.rest
        val scroller = scene.scrolling.scroller
        var time = 1.0
        val at = { dp: Float -> listOf(scene.onPixels(dp), 0.0, scene.onPixels(1000f), scene.onPixels(400f), scene.onPixels(320f), scene.onPixels(400f)) }

        rest.clock = { time }
        scroller.scrollTo(scene.px(100f), 0)
        rest.frame()
        assertEquals("moving is not resting", emptyList<List<Double>>(), scene.rests)

        time = 1.1
        rest.frame()
        assertEquals(listOf(at(100f)), scene.rests)

        rest.touched(touch(MotionEvent.ACTION_DOWN))
        scroller.scrollTo(scene.px(120f), 0)
        time = 1.3
        rest.frame()
        assertEquals("a finger held still is not at rest", 1, scene.rests.size)

        rest.touched(touch(MotionEvent.ACTION_UP))
        time = 1.4
        rest.frame()
        assertEquals(at(120f), scene.rests.last())

        time = 1.5
        rest.frame()
        assertEquals("once per rest", 2, scene.rests.size)
    }

    /**
     * As a UIScrollView does, content past its edges or its corners is not
     * drawn. Kuito's parents don't clip their children, and a hardware
     * render node clips a child to its own bounds only when its parent does,
     * so the scroll view clips itself, to its outline.
     */
    @Test
    fun aScrollViewClipsItsContent() = onScroll("HorizontalScroll") { scene ->
        val view = checkNotNull(scene.renderer.nodes[1]?.view)
        val outline = { Outline().also { view.outlineProvider.getOutline(view, it) } }

        assertTrue("its content stops at its edges", view.clipToOutline)
        assertTrue(!outline().isEmpty)

        scene.renderer.setProperty(1, "borderRadius", KuitoValue.Number(12.0))
        scene.renderer.setProperty(1, "overflow", KuitoValue.Enum(0, "visible"))
        scene.layout()

        assertTrue("and at its rounded corners, overflow or not", view.clipToOutline)
        assertSame("its background's", ViewOutlineProvider.BACKGROUND, view.outlineProvider)
        assertEquals(scene.px(12f).toFloat(), (view.background as GradientDrawable).cornerRadius, 0.5f)
    }

    private fun touch(action: Int) = MotionEvent.obtain(0, 0, action, 0f, 0f, 0)

    @Test
    fun snapOffsetsAreTakenInDp() = onScroll { scene ->
        scene.renderer.setProperty(1, "snapOffsets", numberList(0, 280, 560))

        assertEquals(listOf(0, scene.px(280f), scene.px(560f)), scene.scrolling.snap.offsets)
    }

    @Test
    fun snapOffsetsMustBeAList() = onScroll { scene ->
        val error = assertThrows(KuitoRenderError.UnsupportedValue::class.java) {
            scene.renderer.setProperty(1, "snapOffsets", KuitoValue.Number(280.0))
        }

        assertEquals("snapOffsets", error.prop)
    }

    @Test
    fun aFlingMovesOnToTheNextOffsetEvenWhenItWouldStopShort() {
        val points = listOf(0, 280, 560)

        assertEquals("280 is behind it", 560, rest(points, current = 290, projected = 300, velocity = 1))
        assertEquals(280, rest(points, current = 290, projected = 300, velocity = -1))
        assertEquals("at rest, the nearest", 280, rest(points, current = 400, projected = 400, velocity = 0))
    }

    @Test
    fun theStartAndEndAreRestingPointsToo() {
        assertEquals("content after the last offset stays reachable", 600, rest(listOf(280), current = 590, projected = 600, velocity = 0))
        assertEquals(0, rest(listOf(280), current = 60, projected = 50, velocity = 0))
        assertEquals("an offset past the end is the end", 600, rest(listOf(900), current = 500, projected = 520, velocity = 1))
    }

    @Test
    fun pagingMovesOnePageFromWhereTheDragLetGo() {
        val snap = KuitoScrollSnap().apply { paging = true }

        assertEquals(400, snap.rest(current = 100, projected = 2000, velocity = 1, page = 400, maximum = 1000))
        assertEquals(400, snap.rest(current = 500, projected = 0, velocity = -1, page = 400, maximum = 1000))
        assertEquals("at rest, the nearest page", 0, snap.rest(current = 150, projected = 150, velocity = 0, page = 400, maximum = 1000))
        assertEquals("the last page ends at the end", 1000, snap.rest(current = 900, projected = 900, velocity = 1, page = 400, maximum = 1000))
    }

    @Test
    fun nothingSnapsWithoutPagingOrOffsets() {
        assertEquals(null, KuitoScrollSnap().rest(current = 100, projected = 300, velocity = 1, page = 400, maximum = 1000))
    }

    private fun rest(points: List<Int>, current: Int, projected: Int, velocity: Int) =
        KuitoScrollSnap.restingOffset(points, current, projected, velocity, maximum = 600)
}
