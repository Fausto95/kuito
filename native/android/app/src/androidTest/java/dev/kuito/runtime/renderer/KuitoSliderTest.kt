package dev.kuito.runtime.renderer

import android.graphics.Color
import android.os.Bundle
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.FrameLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.kuito.runtime.link.KuitoModuleView
import dev.kuito.runtime.link.register
import dev.kuito.runtime.modules.slider.KuitoSliderView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Slider (native/modules/slider): a SeekBar over `min`…`max`. Its `change`
 * and `changeEnd` carry the value the user moved it to.
 */
@RunWith(AndroidJUnit4::class)
class KuitoSliderTest {
    private val sent = mutableListOf<String>()

    private fun onSlider(test: (KuitoAndroidRenderer, KuitoSliderView) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val container = FrameLayout(instrumentation.targetContext)
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, container) { _, event, record ->
                    sent.add(record.describe(event))
                }

                KuitoModuleView(::KuitoSliderView, KuitoSliderView::define).register("Slider", listOf("change", "changeEnd"))
                renderer.createView(SLIDER, "module:Slider", 0, "view")
                test(renderer, renderer.nodes.getValue(SLIDER).view as KuitoSliderView)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    /** Moves the thumb as the user does: SeekBar reports the move `fromUser`, as TalkBack's set-progress does. */
    private fun KuitoSliderView.moveTo(progress: Int) {
        val arguments = Bundle().apply { putFloat(AccessibilityNodeInfo.ACTION_ARGUMENT_PROGRESS_VALUE, progress.toFloat()) }

        assertTrue(performAccessibilityAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SET_PROGRESS.id, arguments))
    }

    @Test
    fun theAppsValueSendsNoChange() = onSlider { renderer, slider ->
        renderer.setProperty(SLIDER, "value", KuitoValue.Number(0.5))

        assertEquals(500, slider.progress)
        assertEquals(emptyList<String>(), sent)
    }

    @Test
    fun theUsersMoveSendsItsValue() = onSlider { _, slider ->
        slider.moveTo(750)

        assertEquals(listOf("change {\"value\":0.75}"), sent)
    }

    @Test
    fun newBoundsKeepWhereTheUserLeftTheThumb() = onSlider { renderer, slider ->
        renderer.setProperty(SLIDER, "value", KuitoValue.Number(0.25))
        slider.moveTo(750)

        renderer.setProperty(SLIDER, "max", KuitoValue.Number(2.0))
        assertEquals("the thumb went back to the app's last value", 375, slider.progress)

        renderer.setProperty(SLIDER, "step", KuitoValue.Number(0.25))
        assertEquals(3, slider.progress)
    }

    @Test
    fun theAppsValueAfterAMoveMovesTheThumb() = onSlider { renderer, slider ->
        slider.moveTo(750)
        renderer.setProperty(SLIDER, "value", KuitoValue.Number(0.25))

        assertEquals(250, slider.progress)
    }

    @Test
    fun hexColorsTintTheTrack() = onSlider { renderer, slider ->
        renderer.setProperty(SLIDER, "fillColor", KuitoValue.Text("#ff0000"))
        renderer.setProperty(SLIDER, "trackColor", KuitoValue.Text("#00ff0080"))

        assertEquals(Color.RED, slider.progressTintList?.defaultColor)
        assertEquals(Color.argb(0x80, 0, 0xff, 0), slider.progressBackgroundTintList?.defaultColor)

        renderer.setProperty(SLIDER, "fillColor", KuitoValue.Null)
        assertNull(slider.progressTintList)
    }

    @Test
    fun aColorThatIsNotHexIsUnsupported() = onSlider { renderer, _ ->
        listOf("red", "#12", "#gggggg", "ff0000").forEach { value ->
            val error = assertThrows(value, KuitoRenderError.UnsupportedValue::class.java) {
                renderer.setProperty(SLIDER, "fillColor", KuitoValue.Text(value))
            }

            assertEquals("fillColor", error.prop)
            assertTrue(error.reason, error.reason.contains("a CSS hex color"))
        }
    }
}

private const val SLIDER = 1
