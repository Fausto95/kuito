package dev.kuito.runtime.renderer

import android.text.InputType
import android.view.View
import android.widget.EditText
import android.widget.FrameLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.kuito.runtime.renderer.keyboard.KuitoFocus
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith

/**
 * A field's input props, as HTML's input attributes: `type` and `inputMode`
 * pick the keyboard, `autoCapitalize` and `spellCheck` follow the type unless
 * the app sets them, and `maxLength` cuts what the user types, not what the
 * app sets.
 */
@RunWith(AndroidJUnit4::class)
class KuitoTextFieldTest {
    private val sent = mutableListOf<String>()

    private fun onField(test: (KuitoAndroidRenderer, EditText) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val container = FrameLayout(instrumentation.targetContext)
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, container) { _, event, record ->
                    sent.add(record.describe(event))
                    false
                }

                renderer.createView(FIELD, "TextField", 0, "field")
                test(renderer, renderer.nodes.getValue(FIELD).view as EditText)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    private fun EditText.variation() = inputType and InputType.TYPE_MASK_VARIATION
    private fun EditText.inputClass() = inputType and InputType.TYPE_MASK_CLASS
    private fun EditText.has(flag: Int) = inputType and flag != 0

    @Test
    fun aPlainFieldIsProse() = onField { _, field ->
        assertEquals(InputType.TYPE_CLASS_TEXT, field.inputClass())
        assertTrue(field.has(InputType.TYPE_TEXT_FLAG_CAP_SENTENCES))
        assertFalse(field.has(InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS))
        assertFalse(field.has(InputType.TYPE_TEXT_FLAG_MULTI_LINE))
    }

    @Test
    fun aPasswordHidesItsText() = onField { renderer, field ->
        renderer.setProperty(FIELD, "type", KuitoValue.Enum(1, "password"))

        assertEquals(InputType.TYPE_TEXT_VARIATION_PASSWORD, field.variation())
        assertFalse(field.has(InputType.TYPE_TEXT_FLAG_CAP_SENTENCES))
    }

    @Test
    fun aPasswordKeepsTheFieldsFont() = onField { renderer, field ->
        val typeface = field.typeface

        renderer.setProperty(FIELD, "type", KuitoValue.Enum(1, "password"))

        assertEquals(typeface, field.typeface)
    }

    @Test
    fun anEmailTakesTheEmailKeyboardWithoutCapitals() = onField { renderer, field ->
        renderer.setProperty(FIELD, "type", KuitoValue.Enum(2, "email"))

        assertEquals(InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS, field.variation())
        assertFalse(field.has(InputType.TYPE_TEXT_FLAG_CAP_SENTENCES))
        assertTrue(field.has(InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS))
    }

    @Test
    fun inputModeOverridesTheTypesKeyboard() = onField { renderer, field ->
        renderer.setProperty(FIELD, "type", KuitoValue.Enum(1, "password"))
        renderer.setProperty(FIELD, "inputMode", KuitoValue.Enum(3, "numeric"))

        assertEquals(InputType.TYPE_CLASS_NUMBER, field.inputClass())
        assertEquals(InputType.TYPE_NUMBER_VARIATION_PASSWORD, field.variation())
    }

    @Test
    fun inputModeNoneShowsNoKeyboard() = onField { renderer, field ->
        renderer.setProperty(FIELD, "inputMode", KuitoValue.Enum(0, "none"))

        assertFalse(field.showSoftInputOnFocus)

        renderer.setProperty(FIELD, "inputMode", KuitoValue.Null)

        assertTrue(field.showSoftInputOnFocus)
    }

    @Test
    fun theAppsCapitalizationAndSpellCheckWinOverTheTypes() = onField { renderer, field ->
        renderer.setProperty(FIELD, "type", KuitoValue.Enum(2, "email"))
        renderer.setProperty(FIELD, "autoCapitalize", KuitoValue.Enum(2, "words"))
        renderer.setProperty(FIELD, "spellCheck", KuitoValue.Bool(true))

        assertTrue(field.has(InputType.TYPE_TEXT_FLAG_CAP_WORDS))
        assertTrue(field.has(InputType.TYPE_TEXT_FLAG_AUTO_CORRECT))

        renderer.setProperty(FIELD, "autoCapitalize", KuitoValue.Null)
        renderer.setProperty(FIELD, "spellCheck", KuitoValue.Null)

        assertFalse(field.has(InputType.TYPE_TEXT_FLAG_CAP_WORDS))
        assertTrue(field.has(InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS))
    }

    @Test
    fun autoCompleteNamesTheContentForAutofill() = onField { renderer, field ->
        renderer.setProperty(FIELD, "autoComplete", KuitoValue.Enum(4, "one-time-code"))

        assertArrayEquals(arrayOf("smsOTPCode"), field.autofillHints)

        renderer.setProperty(FIELD, "autoComplete", KuitoValue.Enum(0, "off"))

        assertEquals(View.IMPORTANT_FOR_AUTOFILL_NO, field.importantForAutofill)

        renderer.setProperty(FIELD, "autoComplete", KuitoValue.Null)

        assertEquals(View.IMPORTANT_FOR_AUTOFILL_AUTO, field.importantForAutofill)
    }

    @Test
    fun maxLengthCutsWhatTheUserTypes() = onField { renderer, field ->
        renderer.setProperty(FIELD, "maxLength", KuitoValue.Number(4.0))

        field.append("12")
        field.append("345")
        field.append("5")

        assertEquals("1234", field.text.toString())
    }

    @Test
    fun maxLengthCountsUtf16AndKeepsCharactersWhole() = onField { renderer, field ->
        renderer.setProperty(FIELD, "maxLength", KuitoValue.Number(3.0))

        // Each flag is four UTF-16 units: the second does not fit, and is not cut in half.
        field.append("a🇫🇷🇫🇷")

        assertEquals("a", field.text.toString())
    }

    @Test
    fun maxLengthLeavesTheAppsTextWhole() = onField { renderer, field ->
        renderer.setProperty(FIELD, "maxLength", KuitoValue.Number(2.0))
        renderer.setProperty(FIELD, "text", KuitoValue.Text("hello"))

        assertEquals("hello", field.text.toString())
    }

    @Test
    fun inputModeNoneKeepsTheKeyboardDownOnFocus() = onField { renderer, field ->
        assertTrue(KuitoFocus.showsKeyboard(field))

        renderer.setProperty(FIELD, "inputMode", KuitoValue.Enum(0, "none"))

        assertFalse(KuitoFocus.showsKeyboard(field))
    }

    /** The manifest gives textTransform to Text and Button only, and iOS rejects it on a field. */
    @Test
    fun aFieldRejectsTextTransform() = onField { renderer, _ ->
        val error = assertThrows(KuitoRenderError.UnsupportedProp::class.java) {
            renderer.setProperty(FIELD, "textTransform", KuitoValue.Enum(1, "uppercase"))
        }

        assertEquals("textTransform", error.prop)
    }

    @Test
    fun maxLengthRejectsWhatIsNotAWholeCount() = onField { renderer, _ ->
        for (limit in listOf(Double.POSITIVE_INFINITY, 1e20, -1.0, 2.5)) {
            try {
                renderer.setProperty(FIELD, "maxLength", KuitoValue.Number(limit))
                fail("maxLength accepted $limit")
            } catch (error: KuitoRenderError.UnsupportedValue) {
                assertEquals("maxLength", error.prop)
            }
        }
    }

    @Test
    fun aSingleLineFieldTakesNoCountOfLines() = onField { renderer, _ ->
        // lines={0} is falsy: the kernel keeps the single-line kind and sends it.
        try {
            renderer.setProperty(FIELD, "lines", lineCount(0))
            fail("a single-line field took lines 0")
        } catch (error: KuitoRenderError.UnsupportedValue) {
            assertEquals("lines", error.prop)
        }

        renderer.setProperty(FIELD, "lines", KuitoValue.Null)
    }

    @Test
    fun selectionSelectsItsRange() = onField { renderer, field ->
        renderer.setProperty(FIELD, "text", KuitoValue.Text("hello"))
        renderer.setProperty(FIELD, "selection", selection(1, 3))

        assertEquals(listOf(1, 3), listOf(field.selectionStart, field.selectionEnd))
    }

    @Test
    fun selectionStaysInsideTheText() = onField { renderer, field ->
        renderer.setProperty(FIELD, "text", KuitoValue.Text("hello"))
        renderer.setProperty(FIELD, "selection", selection(2, 99))

        assertEquals(listOf(2, 5), listOf(field.selectionStart, field.selectionEnd))
    }

    @Test
    fun theAppsTextAndUnsetSelectionPutTheCaretAtTheEnd() = onField { renderer, field ->
        renderer.setProperty(FIELD, "text", KuitoValue.Text("hello"))

        assertEquals(listOf(5, 5), listOf(field.selectionStart, field.selectionEnd))

        renderer.setProperty(FIELD, "selection", selection(1, 3))
        renderer.setProperty(FIELD, "selection", KuitoValue.Null)

        assertEquals(listOf(5, 5), listOf(field.selectionStart, field.selectionEnd))
    }

    @Test
    fun theUsersSelectionIsSentOnceAsked() = onField { renderer, field ->
        renderer.setProperty(FIELD, "text", KuitoValue.Text("hello"))
        field.setSelection(1, 2)

        assertEquals(emptyList<String>(), sent.filter { it.startsWith("selectionchange") })

        renderer.setProperty(FIELD, "emitsSelection", KuitoValue.Bool(true))
        field.setSelection(1, 4)

        assertEquals(listOf("selectionchange 1.0 4.0"), sent.filter { it.startsWith("selectionchange") })
    }

    @Test
    fun aBatchsSelectionAndTextSendNoSelectionChange() = onField { renderer, _ ->
        renderer.setProperty(FIELD, "emitsSelection", KuitoValue.Bool(true))
        renderer.setProperty(FIELD, "text", KuitoValue.Text("hello"))
        renderer.setProperty(FIELD, "selection", selection(0, 5))

        assertEquals(emptyList<String>(), sent.filter { it.startsWith("selectionchange") })
    }

    @Test
    fun aSelectionIsRejectedUnlessItIsARange() = onField { renderer, _ ->
        for (value in listOf(KuitoValue.Text("all"), selection(3, 1), selection(-1, 1))) {
            try {
                renderer.setProperty(FIELD, "selection", value)
                fail("selection accepted $value")
            } catch (error: KuitoRenderError.UnsupportedValue) {
                assertEquals("selection", error.prop)
            }
        }
    }

    @Test
    fun anUnknownTypeIsRejected() = onField { renderer, _ ->
        try {
            renderer.setProperty(FIELD, "type", KuitoValue.Enum(7, "color"))
            fail("type accepted color")
        } catch (error: KuitoRenderError.UnsupportedValue) {
            assertEquals("type", error.prop)
        }
    }
}

private const val FIELD = 1
