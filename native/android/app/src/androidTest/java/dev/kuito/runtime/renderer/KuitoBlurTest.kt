package dev.kuito.runtime.renderer

import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.view.View
import android.widget.FrameLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.kuito.runtime.link.KuitoModuleView
import dev.kuito.runtime.link.register
import dev.kuito.runtime.modules.blur.KuitoBlurView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Blur (native/modules/blur): a container that draws what is behind it,
 * blurred and tinted by its material, under the children it lays out.
 */
@RunWith(AndroidJUnit4::class)
class KuitoBlurTest {
    private fun onBlur(test: (KuitoAndroidRenderer, FrameLayout) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val container = FrameLayout(instrumentation.targetContext)
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, container) { _, _, _ -> false }

                KuitoModuleView(::KuitoBlurView, KuitoBlurView::define).register("Blur", emptyList())
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

    private fun KuitoAndroidRenderer.blur(id: Int) = nodes.getValue(id).view as KuitoBlurView

    @Test
    fun eachMaterialBlursAndTintsMoreThanTheOneBefore() = onBlur { renderer, _ ->
        renderer.createView(BLUR, "module:Blur", 0, "blur")

        val blur = renderer.blur(BLUR)
        val looks = listOf("ultraThin", "thin", "regular", "thick").map { material ->
            renderer.setProperty(BLUR, "material", KuitoValue.Text(material))
            blur.look(night = false)
        }

        renderer.setProperty(BLUR, "material", KuitoValue.Null)
        assertEquals("regular by default", looks[2], blur.look(night = false))
        assertEquals(looks.map { it.radius }.sorted(), looks.map { it.radius })
        assertEquals(looks.map { Color.alpha(it.tint) }.sorted(), looks.map { Color.alpha(it.tint) })
    }

    @Test
    fun aDarkSchemeTintsDark() = onBlur { renderer, _ ->
        renderer.createView(BLUR, "module:Blur", 0, "blur")

        val blur = renderer.blur(BLUR)
        val light = blur.look(night = false).tint
        val dark = blur.look(night = true).tint

        assertNotEquals(light, dark)
        assertTrue("dark is darker", Color.luminance(dark) < Color.luminance(light))
        assertEquals(
            blur.look(night = blur.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES),
            blur.look(),
        )
    }

    @Test
    fun aMaterialItDoesNotHaveIsRejected() = onBlur { renderer, _ ->
        renderer.createView(BLUR, "module:Blur", 0, "blur")

        val error = assertThrows(KuitoRenderError.UnsupportedValue::class.java) {
            renderer.setProperty(BLUR, "material", KuitoValue.Text("frosted"))
        }

        assertEquals("material", error.prop)
    }

    /** What is behind it, not what is above it, nor its own children. */
    @Test
    fun itsBackdropIsWhatIsBehindIt() = onBlur { renderer, container ->
        renderer.createView(BEHIND, "Box", 0, "behind")
        renderer.setProperty(BEHIND, "height", KuitoValue.Number(100.0))
        renderer.setProperty(BEHIND, "backgroundColor", KuitoValue.Color(0xff0000ffL.toInt()))
        renderer.createView(BLUR, "module:Blur", 0, "blur")
        renderer.setProperty(BLUR, "position", KuitoValue.Enum(1, "absolute"))
        renderer.setProperty(BLUR, "top", KuitoValue.Number(50.0))
        renderer.setProperty(BLUR, "width", KuitoValue.Number(100.0))
        renderer.setProperty(BLUR, "height", KuitoValue.Number(100.0))
        renderer.createView(CHILD, "Box", BLUR, "child")
        renderer.setProperty(CHILD, "height", KuitoValue.Number(10.0))
        renderer.setProperty(CHILD, "backgroundColor", KuitoValue.Color(0x00ff00ffL.toInt()))
        renderer.createView(ABOVE, "Box", 0, "above")
        renderer.setProperty(ABOVE, "position", KuitoValue.Enum(1, "absolute"))
        renderer.setProperty(ABOVE, "top", KuitoValue.Number(140.0))
        renderer.setProperty(ABOVE, "width", KuitoValue.Number(100.0))
        renderer.setProperty(ABOVE, "height", KuitoValue.Number(10.0))
        renderer.setProperty(ABOVE, "backgroundColor", KuitoValue.Color(0x0000ffffL.toInt()))
        container.layOut()

        val blur = renderer.blur(BLUR)
        val bitmap = Bitmap.createBitmap(blur.width, blur.height, Bitmap.Config.ARGB_8888)

        blur.drawBackdrop(Canvas(bitmap))

        val density = blur.resources.displayMetrics.density
        val at = { y: Int -> bitmap.getPixel(bitmap.width / 2, (y * density).toInt()) }

        assertEquals("the red box behind its top half, its own green child not drawn", Color.RED, at(5))
        assertEquals("the red box behind", Color.RED, at(40))
        assertEquals("nothing behind its lower half", Color.TRANSPARENT, at(70))
        assertEquals("the blue box above it is not its backdrop", Color.TRANSPARENT, at(95))
    }

    @Test
    fun itLaysOutItsChildrenInsideIt() = onBlur { renderer, container ->
        renderer.createView(BLUR, "module:Blur", 0, "blur")
        renderer.setProperty(BLUR, "padding", KuitoValue.Number(12.0))
        renderer.createView(CHILD, "Box", BLUR, "child")
        renderer.setProperty(CHILD, "height", KuitoValue.Number(20.0))
        container.layOut()

        val child = checkNotNull(renderer.nodes.getValue(CHILD).view)

        assertSame(renderer.blur(BLUR), child.parent)
        assertEquals((12 * child.resources.displayMetrics.density).toInt(), child.left)
    }

    private companion object {
        const val BEHIND = 1
        const val BLUR = 2
        const val CHILD = 3
        const val ABOVE = 4
    }
}
