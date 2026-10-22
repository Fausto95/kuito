package dev.kuito.runtime.renderer

import android.widget.FrameLayout
import android.widget.Spinner
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.kuito.runtime.link.KuitoModuleView
import dev.kuito.runtime.link.register
import dev.kuito.runtime.modules.select.KuitoSelectView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Select (native/modules/select): a button that shows the chosen option's
 * label and opens a menu of the options, the chosen one checked. Its
 * `change` carries the value of the option the user picked.
 */
@RunWith(AndroidJUnit4::class)
class KuitoSelectTest {
    private val sent = mutableListOf<String>()

    private fun onSelect(test: (KuitoAndroidRenderer, KuitoSelectView) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val container = FrameLayout(instrumentation.targetContext)
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, container) { _, event, record ->
                    sent.add(record.describe(event))
                    false
                }

                KuitoModuleView(::KuitoSelectView, KuitoSelectView::define).register("Select", listOf("change"))
                renderer.createView(SELECT, "module:Select", 0, "size")
                renderer.setProperty(SELECT, "options", KuitoValue.Json(SIZES))
                test(renderer, renderer.nodes.getValue(SELECT).view as KuitoSelectView)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    @Test
    fun itShowsTheChosenOption() = onSelect { renderer, select ->
        renderer.setProperty(SELECT, "value", KuitoValue.Text("m"))

        assertEquals("Medium", select.text.toString())
    }

    @Test
    fun withNoOptionChosenItShowsThePlaceholder() = onSelect { renderer, select ->
        renderer.setProperty(SELECT, "placeholder", KuitoValue.Text("Size"))
        assertEquals("Size", select.text.toString())

        renderer.setProperty(SELECT, "value", KuitoValue.Text("xl"))
        assertEquals("no option has the value", "Size", select.text.toString())
    }

    @Test
    fun theAppsValueSendsNoChange() = onSelect { renderer, _ ->
        renderer.setProperty(SELECT, "value", KuitoValue.Text("l"))

        assertEquals(emptyList<String>(), sent)
    }

    @Test
    fun theUsersPickSendsItsValueAndShowsIt() = onSelect { renderer, select ->
        renderer.setProperty(SELECT, "value", KuitoValue.Text("s"))
        select.pick("l")

        assertEquals(listOf("""change {"value":"l"}"""), sent)
        assertEquals("Large", select.text.toString())
    }

    @Test
    fun itIsADropDownListToAccessibility() = onSelect { _, select ->
        assertEquals(Spinner::class.java.name, select.accessibilityClassName)
    }

    @Test
    fun disabledTakesNoTouch() = onSelect { renderer, select ->
        renderer.setProperty(SELECT, "disabled", KuitoValue.Bool(true))
        assertFalse(select.isEnabled)

        renderer.setProperty(SELECT, "disabled", KuitoValue.Null)
        assertTrue(select.isEnabled)
    }

    @Test
    fun optionsThatRepeatAValueOrLackALabelAreRejected() = onSelect { renderer, _ ->
        for (value in listOf("""[{"value":"s","label":"Small"},{"value":"s","label":"Short"}]""", """[{"value":"s"}]""", "\"s\"")) {
            val error = assertThrows(value, KuitoRenderError.UnsupportedValue::class.java) {
                renderer.setProperty(SELECT, "options", KuitoValue.Json(value))
            }

            assertEquals("options", error.prop)
        }
    }

    private companion object {
        const val SELECT = 1
        const val SIZES = """[{"value":"s","label":"Small"},{"value":"m","label":"Medium"},{"value":"l","label":"Large"}]"""
    }
}
