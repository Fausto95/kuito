package dev.kuito.runtime.renderer

import android.text.Layout
import android.text.TextPaint
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.kuito.runtime.renderer.KuitoKeyEdit.Op.INSERT
import dev.kuito.runtime.renderer.layout.KuitoLayoutNode
import dev.kuito.runtime.renderer.layout.KuitoMeasureMode
import dev.kuito.runtime.renderer.styling.KuitoMinContent
import dev.kuito.runtime.renderer.views.KuitoListSticky
import dev.kuito.runtime.renderer.views.KuitoListView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.Locale
import kotlin.math.ceil

/**
 * A prop lays a measured leaf out again only when it can change the leaf's
 * size: a paint-only change must not re-measure the text.
 */
@RunWith(AndroidJUnit4::class)
class KuitoRendererLayoutTest {
    private fun onLaidOutLabel(test: (KuitoAndroidRenderer) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val container = FrameLayout(instrumentation.targetContext)
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, container) { _, _, _ -> false }

                renderer.createView(1, "Text", 0, "label")
                renderer.setProperty(1, "text", KuitoValue.Text("Hello"))
                container.measure(
                    View.MeasureSpec.makeMeasureSpec(320, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(640, View.MeasureSpec.EXACTLY),
                )
                container.layout(0, 0, 320, 640)
                test(renderer)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    private fun KuitoAndroidRenderer.label() = checkNotNull(nodes[1]).layout

    /** A pass places each view at its box, shifted by the flattened parents it sits in. */
    @Test
    fun aPassPlacesViewsThroughFlattenedParents() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val container = FrameLayout(instrumentation.targetContext)
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, container) { _, _, _ -> false }

                renderer.createView(1, "VStack", 0, "root")
                renderer.setProperty(1, "padding", KuitoValue.Number(10.0))
                renderer.createView(2, "Box", 1, "group", flattened = true)
                renderer.setProperty(2, "marginLeft", KuitoValue.Number(20.0))
                renderer.setProperty(2, "padding", KuitoValue.Number(5.0))
                renderer.createView(3, "Box", 2, "leaf")
                renderer.setProperty(3, "width", KuitoValue.Number(40.0))
                renderer.setProperty(3, "height", KuitoValue.Number(30.0))
                container.measure(
                    View.MeasureSpec.makeMeasureSpec(320, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(640, View.MeasureSpec.EXACTLY),
                )
                container.layout(0, 0, 320, 640)

                val density = instrumentation.targetContext.resources.displayMetrics.density
                val px = { dp: Float -> kotlin.math.round(dp * density).toInt() }
                val leaf = checkNotNull(checkNotNull(renderer.nodes[3]).layout.view)
                val root = checkNotNull(checkNotNull(renderer.nodes[1]).layout.view)

                assertEquals(px(10f + 20f + 5f), leaf.left)
                assertEquals(px(10f + 5f), leaf.top)
                assertEquals(px(40f), leaf.width)
                assertEquals(px(30f), leaf.height)
                assertEquals(root, leaf.parent)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    /** An enum layout prop reaches the engine as its index among the manifest's values: the text beside it is not read. */
    @Test
    fun anEnumLayoutPropLaysOutByItsIndex() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val container = FrameLayout(instrumentation.targetContext)
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, container) { _, _, _ -> false }

                renderer.createView(1, "VStack", 0, "column")
                renderer.createView(2, "Box", 1, "box")
                renderer.setProperty(1, "height", KuitoValue.Number(200.0))
                renderer.setProperty(2, "height", KuitoValue.Number(20.0))
                // justifyContent: normal, start, end, flex-start, flex-end, ...
                renderer.setProperty(1, "justifyContent", KuitoValue.Enum(4, ""))
                container.measure(
                    View.MeasureSpec.makeMeasureSpec(320, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(640, View.MeasureSpec.EXACTLY),
                )
                container.layout(0, 0, 320, 640)

                val density = instrumentation.targetContext.resources.displayMetrics.density
                val box = checkNotNull(checkNotNull(renderer.nodes[2]).layout.view)

                assertEquals(kotlin.math.round(180f * density).toInt(), box.top)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    private fun onMain(test: () -> Unit) {
        var failure: Throwable? = null

        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            try { test() } catch (error: Throwable) { failure = error }
        }
        failure?.let { throw it }
    }

    /** A column of [count] boxes, each 10 dp taller than the one before. */
    private fun column(count: Int): Pair<KuitoLayoutNode, List<KuitoLayoutNode>> {
        val height = KuitoProps.byKey.indexOf("height")
        val root = KuitoLayoutNode("VStack")
        val boxes = List(count) { index ->
            KuitoLayoutNode("Box").also { box ->
                box.set(height, KuitoValue.Number(10.0 * (index + 1)))
                root.insert(box, index)
            }
        }

        return root to boxes
    }

    /** A pass over a tree whose structure is unchanged hands no node its frames again, nor makes it a new box. */
    @Test
    fun aPassOverTheSameTreeSetsNoField() = onMain {
        val (root, boxes) = column(3)

        root.calculate(320f, 640f, 2f)

        val written = root.fieldWrites
        val first = boxes.map { it.box() }

        root.set(KuitoProps.byKey.indexOf("padding"), KuitoValue.Number(5.0))
        root.calculate(320f, 640f, 2f)

        assertEquals(written, root.fieldWrites)
        boxes.forEachIndexed { index, box -> assertSame(first[index], box.box()) }
        assertEquals(listOf(5f, 15f, 35f), boxes.map { it.box().y })
    }

    /** A new node is laid out in the pass after its insert, and its siblings move. */
    @Test
    fun aPassAfterAnInsertPlacesTheNewNode() = onMain {
        val (root, boxes) = column(2)

        root.calculate(320f, 640f, 2f)

        val added = KuitoLayoutNode("Box")

        added.set(KuitoProps.byKey.indexOf("height"), KuitoValue.Number(5.0))
        root.insert(added, 0)
        root.calculate(320f, 640f, 2f)

        assertEquals(listOf(0f, 5f, 15f), (listOf(added) + boxes).map { it.box().y })
        assertEquals(5f, added.box().height)
    }

    /** A removed node keeps the box it last had, for a view leaving with an exit animation. */
    @Test
    fun aRemovedNodeKeepsItsLastBox() = onMain {
        val (root, boxes) = column(3)

        root.calculate(320f, 640f, 2f)
        boxes[0].removeFromParent()
        root.calculate(320f, 640f, 2f)

        assertEquals(0f, boxes[0].box().y)
        assertEquals(10f, boxes[0].box().height)
        assertEquals(listOf(0f, 20f), boxes.drop(1).map { it.box().y })
        assertEquals(listOf(20f, 30f), boxes.drop(1).map { it.box().height })
    }

    @Test
    fun aLaidOutTextIsClean() = onLaidOutLabel { renderer ->
        assertFalse(renderer.label().dirty)
    }

    @Test
    fun paintPropsKeepTheLayout() = onLaidOutLabel { renderer ->
        renderer.setProperty(1, "color", KuitoValue.Color(0xff0000ff.toInt()))
        renderer.setProperty(1, "opacity", KuitoValue.Number(0.5))
        renderer.setProperty(1, "textAlign", KuitoValue.Enum(1, "center"))

        assertFalse(renderer.label().dirty)
    }

    @Test
    fun textPropsMeasureAgain() = onLaidOutLabel { renderer ->
        renderer.setProperty(1, "text", KuitoValue.Text("Hello again"))

        assertTrue(renderer.label().dirty)
    }

    @Test
    fun fontPropsMeasureAgain() = onLaidOutLabel { renderer ->
        renderer.setProperty(1, "fontSize", KuitoValue.Number(24.0))

        assertTrue(renderer.label().dirty)
    }
}

/**
 * A stylesheet's `gap` reaches a list as `rowGap` and `columnGap`, an inline
 * `gap` prop as itself: either way the list spaces its rows like a flex
 * container, by the gap along its axis.
 */
@RunWith(AndroidJUnit4::class)
class KuitoListGapTest {
    @Test
    fun aHorizontalListSpacesRowsByItsColumnGap() =
        assertLength(kind = "HorizontalList", gaps = mapOf("rowGap" to 4.0, "columnGap" to 12.0), expected = 124f * 2 + 12)

    @Test
    fun aVerticalListSpacesRowsByItsRowGap() =
        assertLength(kind = "List", gaps = mapOf("rowGap" to 12.0, "columnGap" to 4.0), expected = 124f * 2 + 12)

    @Test
    fun anInlineGapSpacesRows() =
        assertLength(kind = "HorizontalList", gaps = mapOf("gap" to 8.0), expected = 124f * 2 + 8)

    /** Two rows estimated 124 long: the list measures their length plus one gap. */
    private fun assertLength(kind: String, gaps: Map<String, Double>, expected: Float) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val container = FrameLayout(instrumentation.targetContext)
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, container) { _, _, _ -> false }

                renderer.createView(1, kind, 0, "list")
                renderer.setProperty(1, "keys", KuitoValue.Keys(listOf(KuitoKeyEdit(INSERT, "a", 0), KuitoKeyEdit(INSERT, "b", 1))))
                renderer.setProperty(1, "estimatedItemSize", KuitoValue.Number(124.0))
                for ((name, value) in gaps) renderer.setProperty(1, name, KuitoValue.Number(value))

                val list = checkNotNull(firstList(container))
                val (width, height) = list.measure(Float.NaN, KuitoMeasureMode.UNDEFINED, Float.NaN, KuitoMeasureMode.UNDEFINED)

                // Lengths are whole pixels: a dp value may round by up to a pixel.
                assertEquals(expected, if (kind == "HorizontalList") width else height, 1f)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    private fun firstList(view: View): KuitoListView? =
        view as? KuitoListView ?: (view as? ViewGroup)?.let { group ->
            (0 until group.childCount).firstNotNullOfOrNull { firstList(group.getChildAt(it)) }
        }
}

/**
 * A sticky row stays at the top of the viewport while its section scrolls
 * under it, and the next sticky row pushes it up as it arrives. Positions
 * are rows; rows 0 and 3 stick, each 100 px long.
 */
@RunWith(AndroidJUnit4::class)
class KuitoListStickyTest {
    private val sticky = listOf(0, 3)

    @Test
    fun aStickyRowStaysAtTheTopOfItsSection() {
        assertEquals(0 to 0, KuitoListSticky.pin(sticky, first = 1, firstTop = -50, topOf = { null }, length = 100))
    }

    @Test
    fun aStickyRowAtItsOwnPlaceIsNotPinned() {
        assertEquals(null, KuitoListSticky.pin(sticky, first = 0, firstTop = 0, topOf = { null }, length = 100))
    }

    @Test
    fun theNextStickyRowPushesItUp() {
        val tops = mapOf(3 to 50)

        assertEquals(0 to -50, KuitoListSticky.pin(sticky, first = 2, firstTop = -50, topOf = tops::get, length = 100))
    }

    @Test
    fun theLastStickyRowAboveTheTopWins() {
        assertEquals(3 to 0, KuitoListSticky.pin(sticky, first = 5, firstTop = -20, topOf = { null }, length = 100))
    }
}

/**
 * Text's min-content width, its widest unbreakable run, is what a shrinking
 * row asks for several times a pass. The label's style keeps it until its
 * text or font changes.
 */
@RunWith(AndroidJUnit4::class)
class KuitoMinContentTest {
    private fun inShrinkingRow(test: (KuitoAndroidRenderer, () -> Unit) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val container = FrameLayout(instrumentation.targetContext)
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, container) { _, _, _ -> false }
                val pass = {
                    container.measure(
                        View.MeasureSpec.makeMeasureSpec(640, View.MeasureSpec.EXACTLY),
                        View.MeasureSpec.makeMeasureSpec(1280, View.MeasureSpec.EXACTLY),
                    )
                    container.layout(0, 0, 640, 1280)
                }

                renderer.createView(1, "HStack", 0, "row")
                renderer.createView(2, "Text", 1, "title")
                renderer.createView(3, "Text", 1, "detail")
                renderer.setProperty(2, "text", KuitoValue.Text("A title long enough to shrink in its row"))
                renderer.setProperty(3, "text", KuitoValue.Text("A detail that shrinks beside it"))
                pass()
                test(renderer, pass)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    private fun KuitoAndroidRenderer.measurements(id: Int) = checkNotNull(nodes[id]).minContent.measurements

    private fun KuitoAndroidRenderer.minContentWidth(id: Int) =
        checkNotNull(nodes[id]).minContent.width(checkNotNull(nodes[id]?.view) as TextView)

    @Test
    fun aShrinkingRowMeasuresEachLabelsWidestRunOnce() = inShrinkingRow { renderer, pass ->
        assertEquals(1, renderer.measurements(2))
        assertEquals(1, renderer.measurements(3))

        renderer.setProperty(3, "text", KuitoValue.Text("Another detail that shrinks beside it"))
        pass()

        assertEquals("a sibling's new text lays the row out again", 1, renderer.measurements(2))
        assertEquals(2, renderer.measurements(3))
    }

    @Test
    fun textAndFontChangesMeasureItAgain() = inShrinkingRow { renderer, pass ->
        val changes = listOf(
            "text" to KuitoValue.Text("Unbelievably wordy title"),
            "fontSize" to KuitoValue.Number(24.0),
            "fontWeight" to KuitoValue.Enum(1, "bold"),
            "letterSpacing" to KuitoValue.Number(2.0),
        )
        var width = renderer.minContentWidth(2)

        for ((index, change) in changes.withIndex()) {
            val (name, value) = change

            renderer.setProperty(2, name, value)
            pass()

            val changed = renderer.minContentWidth(2)

            assertEquals(name, index + 2, renderer.measurements(2))
            assertNotEquals(name, width, changed)
            width = changed
        }
    }

    @Test
    fun aFontScaleChangeMeasuresItAgain() = inShrinkingRow { renderer, pass ->
        val metrics = InstrumentationRegistry.getInstrumentation().targetContext.resources.displayMetrics
        @Suppress("DEPRECATION")
        val scaledDensity = metrics.scaledDensity
        val width = checkNotNull(renderer.minContentWidth(2))

        try {
            @Suppress("DEPRECATION")
            metrics.scaledDensity = scaledDensity * 2
            renderer.configurationChanged()
            pass()

            assertEquals(2, renderer.measurements(2))
            assertTrue(checkNotNull(renderer.minContentWidth(2)) > width)
        } finally {
            @Suppress("DEPRECATION")
            metrics.scaledDensity = scaledDensity
            renderer.configurationChanged()
        }
    }

    /** Where a line may break is the language's rule: a new language measures every text again. */
    @Test
    fun aLanguageChangeMeasuresItAgain() = inShrinkingRow { renderer, pass ->
        val language = Locale.getDefault()

        renderer.configurationChanged()
        pass()

        assertEquals("the same configuration keeps the width", 1, renderer.measurements(2))

        try {
            Locale.setDefault(if (language.language == "ja") Locale.US else Locale.JAPAN)
            renderer.configurationChanged()
            pass()

            assertEquals(2, renderer.measurements(2))
            assertEquals(2, renderer.measurements(3))
        } finally {
            Locale.setDefault(language)
            renderer.configurationChanged()
        }
    }

    /** What is measured is what is drawn: uppercase letters are wider. */
    @Test
    fun uppercaseTextIsMeasuredInCapitals() = inShrinkingRow { renderer, pass ->
        renderer.setProperty(2, "text", KuitoValue.Text("wonderful title"))
        pass()

        val lowercase = checkNotNull(renderer.minContentWidth(2))
        val view = checkNotNull(renderer.nodes[2]?.view) as TextView

        renderer.setProperty(2, "textTransform", KuitoValue.Enum(1, "uppercase"))
        pass()

        assertEquals(KuitoMinContent.widest("WONDERFUL", view.paint), renderer.minContentWidth(2))
        assertTrue(checkNotNull(renderer.minContentWidth(2)) > lowercase)
        assertEquals("WONDERFUL TITLE", view.text.toString())
    }

    @Test
    fun typingInAFieldMeasuresItAgain() = inShrinkingRow { renderer, pass ->
        renderer.createView(4, "TextField", 1, "field")
        renderer.setProperty(4, "text", KuitoValue.Text("Some typed words"))
        pass()

        val before = renderer.measurements(4)

        (checkNotNull(renderer.nodes[4]?.view) as TextView).text = "Some more typed words"
        pass()

        assertEquals(before + 1, renderer.measurements(4))
    }

    /**
     * Runs end where a line may break: punctuation stays with its word, a
     * hyphen ends one, and each ideograph is a run of its own.
     */
    @Test
    fun theWidestRunEndsWhereALineMayBreak() {
        val paint = TextPaint().apply { textSize = 40f }
        val widest = { runs: List<String> -> runs.maxOf { ceil(Layout.getDesiredWidth(it, paint)).toInt() } }

        assertEquals(widest(listOf("Total:", "1,024")), KuitoMinContent.widest("Total: 1,024", paint))
        assertEquals(widest(listOf("well-", "known")), KuitoMinContent.widest("well-known", paint))
        assertEquals(widest(listOf("東", "京", "都")), KuitoMinContent.widest("東京都", paint))
        assertEquals(null, KuitoMinContent.widest(" \n ", paint))
    }
}
