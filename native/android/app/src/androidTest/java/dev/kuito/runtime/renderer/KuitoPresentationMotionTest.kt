package dev.kuito.runtime.renderer

import android.widget.FrameLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.kuito.runtime.renderer.views.KuitoNavigationStackLayout
import dev.kuito.runtime.renderer.views.KuitoSheetLayout
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * A sheet's and a stack's motion sources (docs/motion.md#motion-sources):
 * once the app asks, each move sends where they are, in dp.
 */
@RunWith(AndroidJUnit4::class)
class KuitoPresentationMotionTest {
    private val sent = mutableListOf<String>()

    private fun onRenderer(test: (KuitoAndroidRenderer, Float) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val container = FrameLayout(instrumentation.targetContext)
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, container) { id, event, record ->
                    if (event == "motion") sent += "$id: " + record.numbers.take(record.count).joinToString(" ") { "%.4f".format(it) }
                    false
                }

                test(renderer, container.resources.displayMetrics.density)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    @Test
    fun aSheetSendsItsHeightAndItsProgressBetweenItsSnapPoints() = onRenderer { renderer, density ->
        renderer.createView(1, "Sheet", 0, "sheet")

        val sheet = checkNotNull(renderer.nodes[1]?.view) as KuitoSheetLayout
        val px = { dp: Float -> (dp * density).toInt() }

        sheet.motion.moved(px(300f), px(300f), px(600f))
        assertEquals("nothing until the app asks", emptyList<String>(), sent)

        renderer.setProperty(1, "emitsMotion", KuitoValue.Bool(true))
        sheet.motion.moved(px(450f), px(300f), px(600f))
        sheet.motion.moved(px(450f), px(300f), px(600f))

        val height = px(450f) / density
        val progress = (px(450f) - px(300f)).toDouble() / (px(600f) - px(300f))

        assertEquals("each move, once", listOf("1: %.4f %.4f".format(height, progress)), sent)
    }

    @Test
    fun aStackSendsHowFarABackSwipeHasTakenItsTopScreen() = onRenderer { renderer, _ ->
        renderer.createView(1, "NavigationStack", 0, "stack")

        val stack = checkNotNull(renderer.nodes[1]?.view) as KuitoNavigationStackLayout

        renderer.setProperty(1, "emitsMotion", KuitoValue.Bool(true))
        stack.motion.moved(0.25f)
        stack.motion.moved(0.6f)
        stack.motion.moved(0f)

        assertEquals(listOf("1: 0.2500", "1: 0.6000", "1: 0.0000"), sent)
    }
}
