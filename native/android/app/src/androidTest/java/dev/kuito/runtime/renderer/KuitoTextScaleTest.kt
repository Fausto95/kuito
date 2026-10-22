package dev.kuito.runtime.renderer

import android.util.DisplayMetrics
import android.widget.FrameLayout
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.kuito.runtime.renderer.properties.KuitoTextProperties
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Text sizes are sp, scaled by the user's font size, at most `maxFontScale`
 * times `fontSize`; a font scale change keeps the cap.
 */
@RunWith(AndroidJUnit4::class)
class KuitoTextScaleTest {
    private fun onText(test: (KuitoAndroidRenderer, TextView, Float) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val context = instrumentation.targetContext
                val renderer = KuitoAndroidRenderer(context, FrameLayout(context)) { _, _, _ -> false }

                renderer.createView(1, "Text", 0, "label")
                renderer.setProperty(1, "text", KuitoValue.Text("Hello"))
                test(renderer, checkNotNull(renderer.nodes[1]?.view) as TextView, context.resources.displayMetrics.density)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    /** Metrics of a user who picked text three times as large, with no Android 14 curve. */
    private val tripled = DisplayMetrics().apply {
        density = 2f
        @Suppress("DEPRECATION")
        scaledDensity = 6f
    }

    @Test
    fun aCapLimitsHowMuchTheUsersSizeEnlargesText() {
        assertEquals(120f, KuitoTextProperties.pixels(20f, null, tripled), 0.01f)
        assertEquals(60f, KuitoTextProperties.pixels(20f, 1.5f, tripled), 0.01f)
        assertEquals("a cap above the user's size changes nothing", 120f, KuitoTextProperties.pixels(20f, 4f, tripled), 0.01f)
    }

    @Test
    fun aMaxFontScaleOfOneStopsTextGrowingPastItsFontSize() = onText { renderer, view, density ->
        renderer.setProperty(1, "fontSize", KuitoValue.Number(20.0))
        renderer.setProperty(1, "maxFontScale", KuitoValue.Number(1.0))

        assertEquals(KuitoTextProperties.pixels(20f, 1f, view.resources.displayMetrics), view.textSize, 0.5f)
        assertTrue(view.textSize <= 20f * density + 0.5f)
    }

    @Test
    fun aFontScaleChangeKeepsTheCap() = onText { renderer, view, _ ->
        renderer.setProperty(1, "fontSize", KuitoValue.Number(20.0))
        renderer.setProperty(1, "maxFontScale", KuitoValue.Number(1.5))
        KuitoTextProperties.rescale(view, checkNotNull(renderer.nodes[1]), view.resources.displayMetrics, tripled)

        assertEquals("20 sp tripled is 120 px, capped at 1.5 × 20 dp", 60f, view.textSize, 0.01f)
    }

    @Test
    fun letterSpacingKeepsItsPixelsWhenTheSizeChanges() = onText { renderer, view, _ ->
        renderer.setProperty(1, "fontSize", KuitoValue.Number(20.0))
        renderer.setProperty(1, "letterSpacing", KuitoValue.Number(2.0))

        val spacing = view.letterSpacing * view.textSize

        renderer.setProperty(1, "maxFontScale", KuitoValue.Number(1.0))
        KuitoTextProperties.rescale(view, checkNotNull(renderer.nodes[1]), view.resources.displayMetrics, tripled)

        assertEquals(spacing, view.letterSpacing * view.textSize, 0.01f)
    }

    @Test
    fun aMaxFontScaleBelowOneIsAnError() = onText { renderer, _, _ ->
        val error = assertThrows(KuitoRenderError.UnsupportedValue::class.java) {
            renderer.setProperty(1, "maxFontScale", KuitoValue.Number(0.5))
        }

        assertEquals("maxFontScale", error.prop)
    }
}
