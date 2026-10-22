package dev.kuito.runtime.renderer

import android.widget.FrameLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.kuito.runtime.link.KuitoModuleView
import dev.kuito.runtime.link.register
import dev.kuito.runtime.modules.datepicker.KuitoDatePickerView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * DatePicker (native/modules/date-picker): a button that shows the moment
 * and opens the platform's date and time dialogs. Its value, bounds and type
 * arrive as the module view's props; `change` carries the moment the user
 * picked, in milliseconds.
 */
@RunWith(AndroidJUnit4::class)
class KuitoDatePickerTest {
    private val sent = mutableListOf<String>()

    private fun onPicker(test: (KuitoAndroidRenderer, KuitoDatePickerView) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val container = FrameLayout(instrumentation.targetContext)
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, container) { _, event, record ->
                    sent.add(record.describe(event))
                    false
                }

                KuitoModuleView(::KuitoDatePickerView, KuitoDatePickerView::define).register("DatePicker", listOf("change"))
                renderer.createView(PICKER, "module:DatePicker", 0, "due")
                test(renderer, renderer.nodes.getValue(PICKER).view as KuitoDatePickerView)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    @Test
    fun itShowsTheDateOfItsValue() = onPicker { renderer, picker ->
        renderer.setProperty(PICKER, "value", KuitoValue.Number(MOMENT.toDouble()))

        assertTrue(picker.text.toString(), picker.text.contains("2026"))
        assertFalse(picker.text.toString(), picker.text.contains(":"))
    }

    @Test
    fun typePicksWhatItShows() = onPicker { renderer, picker ->
        renderer.setProperty(PICKER, "value", KuitoValue.Number(MOMENT.toDouble()))
        renderer.setProperty(PICKER, "type", KuitoValue.Text("time"))

        assertTrue(picker.text.toString(), picker.text.contains(":"))
        assertFalse(picker.text.toString(), picker.text.contains("2026"))

        renderer.setProperty(PICKER, "type", KuitoValue.Text("datetime"))

        assertTrue(picker.text.toString(), picker.text.contains(":") && picker.text.contains("2026"))
    }

    @Test
    fun theAppsValueSendsNoChange() = onPicker { renderer, _ ->
        renderer.setProperty(PICKER, "value", KuitoValue.Number(MOMENT.toDouble()))

        assertEquals(emptyList<String>(), sent)
    }

    @Test
    fun theUsersPickSendsItsMomentAndShowsIt() = onPicker { renderer, picker ->
        renderer.setProperty(PICKER, "value", KuitoValue.Number(MOMENT.toDouble()))

        val before = picker.text.toString()

        picker.pick(MOMENT + DAY)

        assertEquals(listOf("""change {"value":1792679400000}"""), sent)
        assertNotEquals(before, picker.text.toString())
    }

    @Test
    fun aPickStaysWithinTheBounds() = onPicker { renderer, picker ->
        renderer.setProperty(PICKER, "min", KuitoValue.Number(MOMENT.toDouble()))
        renderer.setProperty(PICKER, "max", KuitoValue.Number((MOMENT + DAY).toDouble()))

        picker.pick(MOMENT - DAY)
        picker.pick(MOMENT + 2 * DAY)

        assertEquals(listOf("""change {"value":1792593000000}""", """change {"value":1792679400000}"""), sent)
    }

    @Test
    fun aMaxBeforeTheMinWinsRatherThanThrowing() = onPicker { renderer, picker ->
        renderer.setProperty(PICKER, "min", KuitoValue.Number((MOMENT + DAY).toDouble()))
        renderer.setProperty(PICKER, "max", KuitoValue.Number(MOMENT.toDouble()))

        picker.pick(MOMENT + 2 * DAY)

        assertEquals(listOf("""change {"value":1792593000000}"""), sent)
    }

    @Test
    fun disabledTakesNoTouch() = onPicker { renderer, picker ->
        renderer.setProperty(PICKER, "disabled", KuitoValue.Bool(true))
        assertFalse(picker.isEnabled)

        renderer.setProperty(PICKER, "disabled", KuitoValue.Null)
        assertTrue(picker.isEnabled)
    }

    @Test
    fun anUnknownTypeOrAValueThatIsNoMomentIsRejected() = onPicker { renderer, _ ->
        for ((name, value) in listOf("type" to KuitoValue.Text("week"), "value" to KuitoValue.Text("tomorrow"), "min" to KuitoValue.Bool(true))) {
            val error = assertThrows(name, KuitoRenderError.UnsupportedValue::class.java) { renderer.setProperty(PICKER, name, value) }

            assertEquals(name, error.prop)
        }
    }

    private companion object {
        const val PICKER = 1

        /** 21 October 2026, 14:30 UTC. */
        const val MOMENT = 1_792_593_000_000L
        const val DAY = 86_400_000L
    }
}
