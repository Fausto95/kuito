package dev.kuito.runtime.renderer

import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.widget.EditText
import android.widget.FrameLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import org.junit.runner.RunWith

/**
 * A field with a format (docs/keyboard.md#formatting): the user's edit goes
 * to the format first, as a `format` event, once the keyboard's batch of
 * edits ends; when the UI thread answers it, by setting the text and the
 * caret before the event returns, the field then reports the formatted text
 * as its change. Setting the text there runs the TextWatcher again, inside
 * the one reporting the edit, which reports nothing. A composition reports
 * its text as typed and formats once it commits. These tests type through
 * the keyboard's InputConnection and answer as the UI thread's kernel does,
 * through the renderer's own setters.
 */
@RunWith(AndroidJUnit4::class)
class KuitoTextFormatTest {
    private val sent = mutableListOf<String>()

    /** What the UI thread makes of an edit: the text and the caret. Null leaves it to the JS thread. */
    private var answer: ((String) -> Pair<String, Int>)? = { text ->
        val grouped = text.filter(Char::isDigit).chunked(4).joinToString(" ")

        grouped to grouped.length
    }

    private fun onField(kind: String = "TextField", test: (KuitoAndroidRenderer, EditText, InputConnection) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                lateinit var renderer: KuitoAndroidRenderer

                renderer = KuitoAndroidRenderer(instrumentation.targetContext, FrameLayout(instrumentation.targetContext)) { id, event, record ->
                    if (event != "format") {
                        sent.add(record.describe(event))

                        return@KuitoAndroidRenderer false
                    }

                    val text = record.strings.first()

                    sent.add("format $text ${record.numbers.take(record.count).map(Double::toInt)}")

                    val (shown, caret) = answer?.invoke(text) ?: return@KuitoAndroidRenderer false

                    renderer.setProperty(id, "text", KuitoValue.Text(shown))
                    renderer.setProperty(id, "selection", selection(caret, caret))
                    true
                }

                renderer.createView(FIELD, kind, 0, "card")
                renderer.setProperty(FIELD, "formats", KuitoValue.Bool(true))

                val field = renderer.nodes.getValue(FIELD).view as EditText
                val keyboard = field.onCreateInputConnection(EditorInfo()) ?: error("the field takes no keyboard")

                test(renderer, field, keyboard)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    private fun change(text: String) = KuitoEventRecord().also(KuitoTextPayload(text)::write).describe("change")

    private fun EditText.selection() = listOf(selectionStart, selectionEnd)

    @Test
    fun anEditIsFormattedBeforeItsChangeIsSent() = onField { _, field, keyboard ->
        "42424".forEach { keyboard.commitText(it.toString(), 1) }

        assertEquals("4242 4", field.text.toString())
        assertEquals(listOf(6, 6), field.selection())
        assertEquals(listOf("format 42424 [5, 5]", change("4242 4")), sent.takeLast(2))
        assertFalse("the unformatted text is never reported", change("42424") in sent)
        // The format's own text set ran the TextWatcher again, which reported nothing.
        assertEquals(5, sent.count { it.startsWith("change") })
    }

    @Test
    fun anEditTheUIThreadLeavesIsTheJSThreadsToReport() = onField { _, _, keyboard ->
        answer = null

        keyboard.commitText("4", 1)

        assertEquals(listOf("format 4 [1, 1]"), sent)
    }

    @Test
    fun aKeyboardsBatchOfEditsFormatsOnceItEnds() = onField { _, field, keyboard ->
        keyboard.beginBatchEdit()
        keyboard.commitText("4242", 1)
        keyboard.commitText("4", 1)

        assertEquals(emptyList<String>(), sent)

        keyboard.endBatchEdit()

        assertEquals(listOf("format 42424 [5, 5]", change("4242 4")), sent)
        assertEquals("4242 4", field.text.toString())
    }

    @Test
    fun aCompositionReportsItsTextAndFormatsOnceItCommits() = onField { _, field, keyboard ->
        answer = { text -> text.uppercase() to text.length }

        keyboard.setComposingText("ni", 1)

        assertEquals("mid-composition: no format", listOf(change("ni")), sent)

        keyboard.finishComposingText()

        assertEquals("NI", field.text.toString())
        assertEquals(listOf(change("ni"), "format ni [2, 2]", change("NI")), sent)
    }

    @Test
    fun theFormatsCaretIsTheUsersSelection() = onField { renderer, _, keyboard ->
        renderer.setProperty(FIELD, "emitsSelection", KuitoValue.Bool(true))

        "42424".forEach { keyboard.commitText(it.toString(), 1) }

        assertEquals(
            KuitoEventRecord().also(KuitoTextSelection(6.0, 6.0)::write).describe("selectionchange"),
            sent.last(),
        )
    }

    @Test
    fun theTextAFieldShowsAlreadyLeavesItsCaret() = onField { renderer, field, _ ->
        renderer.setProperty(FIELD, "text", KuitoValue.Text("4242 4242"))
        renderer.setProperty(FIELD, "selection", selection(2, 2))
        renderer.setProperty(FIELD, "text", KuitoValue.Text("4242 4242"))

        assertEquals(listOf(2, 2), field.selection())
    }

    @Test
    fun aMultiLineFieldFormatsAsASingleLineOneDoes() = onField("MultilineTextField") { _, field, keyboard ->
        answer = { text -> text.uppercase() to text.length }

        keyboard.commitText("a", 1)

        assertEquals("A", field.text.toString())
        assertEquals(listOf("format a [1, 1]", change("A")), sent)
    }

    private companion object {
        const val FIELD = 1
    }
}
