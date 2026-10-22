package dev.kuito.runtime.renderer

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.view.View
import android.widget.FrameLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.kuito.runtime.link.KuitoModuleView
import dev.kuito.runtime.link.register
import dev.kuito.runtime.modules.drawing.KuitoDrawingView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Drawing (native/modules/drawing): each shape's `d` as the shared parser
 * reads it (native/shared/PathData.h), drawn with its paint inside the
 * viewBox fitted to the view.
 */
@RunWith(AndroidJUnit4::class)
class KuitoDrawingTest {
    private fun onDrawing(test: (KuitoAndroidRenderer, FrameLayout) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val container = FrameLayout(instrumentation.targetContext)
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, container) { _, _, _ -> false }

                KuitoModuleView(::KuitoDrawingView, KuitoDrawingView::define).register("Drawing", emptyList())
                renderer.createView(DRAWING, "module:Drawing", 0, "drawing")
                renderer.setProperty(DRAWING, "width", KuitoValue.Number(200.0))
                renderer.setProperty(DRAWING, "height", KuitoValue.Number(200.0))
                test(renderer, container)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    private fun FrameLayout.layOut() {
        val density = resources.displayMetrics.density

        measure(
            View.MeasureSpec.makeMeasureSpec((320 * density).toInt(), View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec((640 * density).toInt(), View.MeasureSpec.EXACTLY),
        )
        layout(0, 0, (320 * density).toInt(), (640 * density).toInt())
    }

    private fun KuitoAndroidRenderer.drawing() = nodes.getValue(DRAWING).view as KuitoDrawingView

    /** The view drawn into a bitmap, read at a point in dp. */
    private fun KuitoDrawingView.pixels(): (Float, Float) -> Int {
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)

        draw(Canvas(bitmap))

        val density = resources.displayMetrics.density

        return { x, y -> bitmap.getPixel((x * density).toInt(), (y * density).toInt()) }
    }

    private fun shape(fields: String) =
        """{"fill":"#ff0000ff","fillRule":"nonzero","stroke":null,"strokeWidth":1,"strokeLinecap":"butt","strokeLinejoin":"miter","strokeMiterlimit":4,"strokeDasharray":[],"strokeDashoffset":0,"opacity":1,"transform":[1,0,0,1,0,0],$fields}"""

    @Test
    fun eachShapeFillsItsPath() = onDrawing { renderer, container ->
        renderer.setProperty(DRAWING, "shapes", KuitoValue.Json("[${shape(""""d":"M0 0H50V50H0Z"""")}]"))
        container.layOut()

        val at = renderer.drawing().pixels()

        assertEquals("inside the square", Color.RED, at(25f, 25f))
        assertEquals("outside it", Color.TRANSPARENT, at(75f, 75f))
    }

    @Test
    fun theViewBoxFitsTheViewKeepingItsAspect() = onDrawing { renderer, container ->
        renderer.setProperty(DRAWING, "shapes", KuitoValue.Json("[${shape(""""d":"M0 0H50V50H0Z"""")}]"))
        renderer.setProperty(DRAWING, "viewBox", KuitoValue.Json("[0,0,100,100]"))
        container.layOut()

        val scaled = renderer.drawing().pixels()

        assertEquals("twice as large", Color.RED, scaled(90f, 90f))
        assertEquals(Color.TRANSPARENT, scaled(110f, 110f))

        renderer.setProperty(DRAWING, "height", KuitoValue.Number(100.0))
        container.layOut()

        val centered = renderer.drawing().pixels()

        assertEquals("centered across: the square starts 50 in", Color.TRANSPARENT, centered(40f, 25f))
        assertEquals(Color.RED, centered(60f, 25f))
    }

    @Test
    fun paintBecomesTheStrokeAndFill() = onDrawing { renderer, _ ->
        renderer.setProperty(
            DRAWING,
            "shapes",
            KuitoValue.Json(
                """[{"d":"M0 0L10 10","fill":null,"fillRule":"evenodd","stroke":"#0000ff80","strokeWidth":3,"strokeLinecap":"round","strokeLinejoin":"bevel","strokeMiterlimit":8,"strokeDasharray":[2,1],"strokeDashoffset":1,"opacity":0.5,"transform":[2,0,0,2,5,6]}]""",
            ),
        )

        val shape = renderer.drawing().shapes.single()
        val stroke = checkNotNull(shape.stroke)

        assertNull(shape.fill)
        assertEquals(Path.FillType.EVEN_ODD, shape.path.fillType)
        assertEquals(Color.argb(128, 0, 0, 255), stroke.color)
        assertEquals(3f, stroke.strokeWidth)
        assertEquals(Paint.Cap.ROUND, stroke.strokeCap)
        assertEquals(Paint.Join.BEVEL, stroke.strokeJoin)
        assertEquals(8f, stroke.strokeMiter)
        assertNotNull("dashed", stroke.pathEffect)
        assertEquals(0.5f, shape.opacity)
        assertEquals(listOf(2f, 0f, 5f, 0f, 2f, 6f, 0f, 0f, 1f), FloatArray(9).also(shape.transform::getValues).toList())
    }

    @Test
    fun malformedPathDataIsRejectedWithTheParsersError() = onDrawing { renderer, _ ->
        val error = assertThrows(KuitoRenderError.UnsupportedValue::class.java) {
            renderer.setProperty(DRAWING, "shapes", KuitoValue.Json("[${shape(""""d":"L1 2"""")}]"))
        }

        assertEquals("shapes", error.prop)
        assertTrue(error.message, error.message.orEmpty().contains("KUITO_PATH: path data starts with a moveto"))
    }

    @Test
    fun aViewBoxIsFourNumbersWithASize() = onDrawing { renderer, _ ->
        for (value in listOf("[0,0,100]", "[0,0,0,100]", "\"0 0 100 100\"")) {
            assertThrows(value, KuitoRenderError.UnsupportedValue::class.java) {
                renderer.setProperty(DRAWING, "viewBox", KuitoValue.Json(value))
            }
        }
    }

    private companion object {
        const val DRAWING = 1
    }
}
