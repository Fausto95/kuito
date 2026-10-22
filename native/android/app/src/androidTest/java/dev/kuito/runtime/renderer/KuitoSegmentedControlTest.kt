package dev.kuito.runtime.renderer

import android.view.View
import android.widget.FrameLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.android.material.button.MaterialButton
import dev.kuito.runtime.link.KuitoModuleView
import dev.kuito.runtime.link.register
import dev.kuito.runtime.modules.segmentedcontrol.KuitoSegmentedControlView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * SegmentedControl (native/modules/segmented-control): Material's segmented
 * button, a toggle group with a button per option, the chosen one checked.
 * Its `change` carries the value of the button the user tapped.
 */
@RunWith(AndroidJUnit4::class)
class KuitoSegmentedControlTest {
    private val sent = mutableListOf<String>()

    private fun onControl(test: (KuitoAndroidRenderer, KuitoSegmentedControlView) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val container = FrameLayout(instrumentation.targetContext)
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, container) { _, event, record ->
                    sent.add(record.describe(event))
                }

                KuitoModuleView(::KuitoSegmentedControlView, KuitoSegmentedControlView::define).register("SegmentedControl", listOf("change"))
                renderer.createView(CONTROL, "module:SegmentedControl", 0, "view")
                renderer.setProperty(CONTROL, "options", KuitoValue.Json(VIEWS))
                test(renderer, renderer.nodes.getValue(CONTROL).view as KuitoSegmentedControlView)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    private fun KuitoSegmentedControlView.buttons() = (0 until childCount).map { getChildAt(it) as MaterialButton }

    private fun KuitoSegmentedControlView.checked() = buttons().filter { it.isChecked }.map { it.text.toString() }

    @Test
    fun aButtonPerOptionTheChosenOneChecked() = onControl { renderer, control ->
        renderer.setProperty(CONTROL, "value", KuitoValue.Text("week"))

        assertEquals(listOf("Day", "Week", "Month"), control.buttons().map { it.text.toString() })
        assertEquals(listOf("Week"), control.checked())
    }

    @Test
    fun aValueThatNamesNoOptionChecksNone() = onControl { renderer, control ->
        renderer.setProperty(CONTROL, "value", KuitoValue.Text("year"))
        assertEquals(emptyList<String>(), control.checked())

        renderer.setProperty(CONTROL, "value", KuitoValue.Text("day"))
        renderer.setProperty(CONTROL, "value", KuitoValue.Null)
        assertEquals(emptyList<String>(), control.checked())
    }

    @Test
    fun newOptionsKeepTheChosenValue() = onControl { renderer, control ->
        renderer.setProperty(CONTROL, "value", KuitoValue.Text("week"))
        renderer.setProperty(CONTROL, "options", KuitoValue.Json("""[{"value":"week","label":"This week"},{"value":"day","label":"Today"}]"""))

        assertEquals(listOf("This week", "Today"), control.buttons().map { it.text.toString() })
        assertEquals(listOf("This week"), control.checked())
    }

    @Test
    fun theAppsValueSendsNoChange() = onControl { renderer, _ ->
        renderer.setProperty(CONTROL, "value", KuitoValue.Text("day"))
        renderer.setProperty(CONTROL, "value", KuitoValue.Text("month"))

        assertEquals(emptyList<String>(), sent)
    }

    @Test
    fun theUsersTapSendsItsValueAndChecksIt() = onControl { renderer, control ->
        renderer.setProperty(CONTROL, "value", KuitoValue.Text("day"))
        control.buttons()[2].performClick()

        assertEquals(listOf("""change {"value":"month"}"""), sent)
        assertEquals(listOf("Month"), control.checked())
    }

    @Test
    fun tappingTheChosenButtonKeepsIt() = onControl { renderer, control ->
        renderer.setProperty(CONTROL, "value", KuitoValue.Text("day"))
        control.buttons()[0].performClick()

        assertEquals(emptyList<String>(), sent)
        assertEquals(listOf("Day"), control.checked())
    }

    @Test
    fun disabledTakesNoTouch() = onControl { renderer, control ->
        renderer.setProperty(CONTROL, "disabled", KuitoValue.Bool(true))
        assertFalse(control.buttons().any(View::isEnabled))

        renderer.setProperty(CONTROL, "options", KuitoValue.Json(VIEWS))
        assertFalse("new segments of a disabled control", control.buttons().any(View::isEnabled))

        renderer.setProperty(CONTROL, "disabled", KuitoValue.Null)
        assertTrue(control.buttons().all(View::isEnabled))
    }

    @Test
    fun optionsThatRepeatAValueOrLackALabelAreRejected() = onControl { renderer, _ ->
        for (value in listOf("""[{"value":"day","label":"Day"},{"value":"day","label":"Today"}]""", """[{"value":"day"}]""", "\"day\"")) {
            val error = assertThrows(value, KuitoRenderError.UnsupportedValue::class.java) {
                renderer.setProperty(CONTROL, "options", KuitoValue.Json(value))
            }

            assertEquals("options", error.prop)
        }
    }

    private companion object {
        const val CONTROL = 1
        const val VIEWS = """[{"value":"day","label":"Day"},{"value":"week","label":"Week"},{"value":"month","label":"Month"}]"""
    }
}
