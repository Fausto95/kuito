package dev.kuito.runtime.renderer

import android.widget.FrameLayout
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlin.math.roundToInt
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * keyboard.height (docs/keyboard.md#keyboard): once the app asks, each
 * change of the keyboard's inset goes out as `keyboard.move`, in dp, every
 * frame of the inset animation.
 */
@RunWith(AndroidJUnit4::class)
class KuitoKeyboardMotionTest {
    private val heights = mutableListOf<Double>()

    private fun onRenderer(test: (KuitoAndroidRenderer, FrameLayout) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val container = FrameLayout(instrumentation.targetContext)
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, container) { id, event, record ->
                    if (id == 0 && event == "keyboard.move") heights += record.numbers.take(record.count)
                    false
                }

                test(renderer, container)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    /** The keyboard covering `dp` of the window's bottom, delivered to the renderer's root. */
    private fun FrameLayout.keyboard(dp: Float) {
        val px = (dp * resources.displayMetrics.density).roundToInt()
        val insets = WindowInsetsCompat.Builder()
            .setInsets(WindowInsetsCompat.Type.ime(), Insets.of(0, 0, 0, px))
            .setVisible(WindowInsetsCompat.Type.ime(), px > 0)
            .build()

        ViewCompat.dispatchApplyWindowInsets(getChildAt(0), insets)
    }

    private fun FrameLayout.onPixels(dp: Float): Double {
        val density = resources.displayMetrics.density

        return ((dp * density).roundToInt() / density).toDouble()
    }

    @Test
    fun theHeightGoesOutAsTheKeyboardMovesOnceTheAppAsks() = onRenderer { renderer, container ->
        container.keyboard(50f)
        assertEquals("nothing until the app asks", emptyList<Double>(), heights)

        renderer.command(0, "keyboard.motion", "on")
        assertEquals("not inside the batch that asked", emptyList<Double>(), heights)

        renderer.keyboard.motion.frame()
        container.keyboard(120f)
        container.keyboard(336f)
        assertEquals(listOf(container.onPixels(50f), container.onPixels(120f), container.onPixels(336f)), heights)

        renderer.command(0, "keyboard.motion", "off")
        container.keyboard(0f)
        assertEquals(3, heights.size)
    }
}
