package dev.kuito.runtime.renderer

import android.text.InputType
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.FrameLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith

/**
 * A field with `lines` wraps its text: as tall as its lines (a number) or as
 * its text within a range of lines, growing as the user types; the enter key
 * adds a line unless `submitBehavior` says it submits.
 */
@RunWith(AndroidJUnit4::class)
class KuitoMultilineTextFieldTest {
    private val sent = mutableListOf<String>()

    private fun onField(test: (KuitoAndroidRenderer, EditText, () -> Unit) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val container = FrameLayout(instrumentation.targetContext)
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, container) { _, event, record ->
                    sent.add(record.describe(event))
                    false
                }
                val layOut = {
                    container.measure(
                        View.MeasureSpec.makeMeasureSpec(320, View.MeasureSpec.EXACTLY),
                        View.MeasureSpec.makeMeasureSpec(640, View.MeasureSpec.EXACTLY),
                    )
                    container.layout(0, 0, 320, 640)
                }

                renderer.createView(1, "VStack", 0, "screen")
                renderer.createView(FIELD, "MultilineTextField", 1, "notes")
                test(renderer, requireNotNull(renderer.nodes[FIELD]?.view as? EditText), layOut)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    private fun EditText.pressEnter() {
        setSelection(text.length)
        dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER))
        dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER))
    }

    private fun EditText.entersNewLines(): Boolean {
        val attributes = EditorInfo()

        onCreateInputConnection(attributes)

        return attributes.imeOptions and EditorInfo.IME_FLAG_NO_ENTER_ACTION != 0
    }

    @Test
    fun aFieldWithLinesWraps() = onField { _, field, _ ->
        assertTrue(field.inputType and InputType.TYPE_TEXT_FLAG_MULTI_LINE != 0)
        assertEquals(Int.MAX_VALUE, field.maxLines)
    }

    @Test
    fun aFixedCountOfLinesSetsItsHeight() = onField { renderer, field, _ ->
        renderer.setProperty(FIELD, "lines", lineCount(3))

        assertEquals(3, field.minLines)
        assertEquals(3, field.maxLines)
    }

    @Test
    fun aRangeOfLinesFollowsTheText() = onField { renderer, field, layOut ->
        renderer.setProperty(FIELD, "lines", lineRange(1, 3))
        layOut()

        val one = field.height

        renderer.setProperty(FIELD, "text", KuitoValue.Text("one\ntwo"))
        layOut()

        val two = field.height

        renderer.setProperty(FIELD, "text", KuitoValue.Text("one\ntwo\nthree\nfour\nfive"))
        layOut()

        assertEquals(1, field.minLines)
        assertEquals(3, field.maxLines)
        assertTrue("$one < $two", one < two)
        assertTrue("${field.height} caps at three lines", field.height < two * 2)
    }

    @Test
    fun typingMarksTheFieldForLayout() = onField { renderer, field, layOut ->
        renderer.setProperty(FIELD, "lines", lineRange(1, 4))
        layOut()

        assertFalse(checkNotNull(renderer.nodes[FIELD]).layout.dirty)

        field.append("hello\nworld")

        assertTrue(checkNotNull(renderer.nodes[FIELD]).layout.dirty)
    }

    @Test
    fun enterAddsALineByDefault() = onField { renderer, field, _ ->
        renderer.setProperty(FIELD, "lines", lineCount(3))
        field.append("a")
        field.pressEnter()

        assertEquals("a\n", field.text.toString())
        assertTrue(field.entersNewLines())
        assertFalse(sent.any { it.startsWith("submit") })
    }

    @Test
    fun submitBehaviorSubmitMakesEnterSubmit() = onField { renderer, field, _ ->
        renderer.setProperty(FIELD, "lines", lineCount(3))
        renderer.setProperty(FIELD, "submitBehavior", KuitoValue.Enum(0, "submit"))
        field.append("a")
        field.pressEnter()

        assertEquals("a", field.text.toString())
        assertFalse(field.entersNewLines())
        assertEquals(listOf("submit a"), sent.filter { it.startsWith("submit") })
    }

    @Test
    fun changingLinesOnAShownFieldResizesIt() = onField { renderer, field, layOut ->
        renderer.setProperty(FIELD, "lines", lineCount(1))
        layOut()

        val one = field.height

        renderer.setProperty(FIELD, "lines", lineCount(3))
        layOut()

        assertTrue("${field.height} > $one", field.height > one)
    }

    @Test
    fun aNewLineFromTheKeyboardSubmitsWhenTheFieldSubmits() = onField { renderer, field, _ ->
        renderer.setProperty(FIELD, "lines", lineCount(3))
        renderer.setProperty(FIELD, "submitBehavior", KuitoValue.Enum(0, "submit"))
        // Some keyboards commit a new line instead of performing the enter key's action.
        field.append("a\n")

        assertEquals("a", field.text.toString())
        assertEquals(listOf("submit a"), sent.filter { it.startsWith("submit") })
    }

    @Test
    fun aMultiLineFieldTakesOnlyTextTypes() = onField { renderer, _, _ ->
        renderer.setProperty(FIELD, "type", KuitoValue.Enum(6, "search"))

        for ((index, type) in listOf(1 to "password", 3 to "number", 4 to "tel")) {
            try {
                renderer.setProperty(FIELD, "type", KuitoValue.Enum(index, type))
                fail("a multi-line field took type $type")
            } catch (error: KuitoRenderError.UnsupportedValue) {
                assertEquals("type", error.prop)
            }
        }
    }

    @Test
    fun aMultiLineFieldTakesOnlyTextKeyboards() = onField { renderer, _, _ ->
        renderer.setProperty(FIELD, "inputMode", KuitoValue.Enum(7, "url"))

        for ((index, mode) in listOf(2 to "decimal", 3 to "numeric", 4 to "tel")) {
            try {
                renderer.setProperty(FIELD, "inputMode", KuitoValue.Enum(index, mode))
                fail("a multi-line field took inputMode $mode")
            } catch (error: KuitoRenderError.UnsupportedValue) {
                assertEquals("inputMode", error.prop)
            }
        }
    }

    @Test
    fun linesRejectsAnythingButACountOrARange() = onField { renderer, _, _ ->
        for (value in listOf(KuitoValue.Text("three"), lineCount(0), lineRange(3, 1), lineRange(0, null), KuitoValue.Number(2.0))) {
            try {
                renderer.setProperty(FIELD, "lines", value)
                fail("lines accepted $value")
            } catch (error: KuitoRenderError.UnsupportedValue) {
                assertEquals("lines", error.prop)
            }
        }
    }
}

private const val FIELD = 2
