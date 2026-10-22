package dev.kuito.runtime.renderer.keyboard

import android.content.Context
import android.text.InputFilter
import android.text.Spanned
import android.view.Gravity
import android.view.MotionEvent
import android.view.inputmethod.BaseInputConnection
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.widget.EditText

/**
 * A field the user types into: single-line, or multi-line for a field with
 * `lines`, which wraps its text over a count or a range of lines. It knows
 * submitBehavior, autoFocus and HTML's input attributes.
 */
internal class KuitoEditText(context: Context, val multiline: Boolean = false) : EditText(context) {
    /** Null is the kind's default: `blurAndSubmit` single-line, `newline` multi-line. */
    var submitBehavior: String? = null

    /** Whether the enter key adds a line rather than submitting. */
    val addsLines: Boolean get() = multiline && (submitBehavior ?: "newline") == "newline"

    /** Sends `submit` with the field's text. */
    var onSubmit: ((String) -> Unit)? = null

    var autoFocus = false
        set(value) {
            field = value
            focusIfNeeded()
        }

    var traits = KuitoInputTraits(multiline = multiline)
        set(value) {
            field = value
            applyTraits()
        }

    /** HTML's `maxlength`, for what the user enters (KuitoMaxLength). */
    var maxLength: Int? = null

    /** A multi-line field's lines: `min` to `max`, null for no limit. */
    var lines: Pair<Int, Int?> = 1 to null
        set(value) {
            field = value
            applyLines()
        }

    init {
        filters = arrayOf(NewLineSubmits(), KuitoMaxLength(this))
        applyTraits()

        if (multiline) {
            gravity = Gravity.TOP or Gravity.START
            setHorizontallyScrolling(false)
        }
    }

    private fun applyTraits() {
        // A password input type switches the font to monospace: the field keeps its own.
        val face = typeface

        inputType = traits.inputType
        typeface = face
        setAutofillHints(*listOfNotNull(traits.autofillHint).toTypedArray())
        importantForAutofill = traits.importantForAutofill
        showSoftInputOnFocus = traits.showsKeyboard
        // Leaving a password input type resets the line limits.
        applyLines()
    }

    private fun applyLines() {
        if (!multiline) return

        minLines = lines.first
        maxLines = lines.second ?: Int.MAX_VALUE
    }

    /**
     * Some keyboards commit a new line rather than perform the enter key's
     * action: a multi-line field that submits takes it as the action, as iOS
     * takes its return key.
     */
    private inner class NewLineSubmits : InputFilter {
        override fun filter(source: CharSequence, start: Int, end: Int, dest: Spanned, dstart: Int, dend: Int): CharSequence? {
            if (!multiline || addsLines || settingText) return null

            val typed = source.subSequence(start, end).toString()

            if ('\n' !in typed) return null

            val kept = typed.replace("\n", "")

            onSubmit?.invoke(dest.replaceRange(dstart, dend, kept).toString())
            // After the edit lands: blurring inside it would leave it half applied.
            post { KuitoFocus.submitted(this@KuitoEditText) }

            return kept
        }
    }

    // A field whose text scrolls inside it keeps the drag from the scroll view around it.
    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (multiline && event.actionMasked == MotionEvent.ACTION_DOWN && (canScrollVertically(1) || canScrollVertically(-1))) {
            parent?.requestDisallowInterceptTouchEvent(true)
        }

        return super.onTouchEvent(event)
    }

    /** A multi-line field that submits shows the enter key's action instead of adding a line. */
    override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? {
        val connection = super.onCreateInputConnection(outAttrs)

        if (multiline && !addsLines) outAttrs.imeOptions = outAttrs.imeOptions and EditorInfo.IME_FLAG_NO_ENTER_ACTION.inv()

        return connection
    }

    /** Whether the user's selection is sent: something listens to it (`emitsSelection`). */
    var emitsSelection = false

    /** Sends the user's selection, as UTF-16 offsets. */
    var onSelection: ((Int, Int) -> Unit)? = null

    // The selection the app last knows of, its own or the user's: an unchanged one sends nothing.
    private var knownStart = -1
    private var knownEnd = -1

    /** True while a prop sets the text or the selection: the listeners' calls are not the user's. */
    var settingText = false
        private set

    /**
     * Sets the text as a prop does, with the caret after it as HTML puts it.
     * It replaces the text in place, as an edit does: setText would restart
     * the keyboard's connection, dropping its state (shift, suggestions)
     * while the user types. The TextWatcher runs inside it; iOS sends nothing.
     */
    fun setTextQuietly(text: String) = quietly {
        val editable = this.text

        editable.replace(0, editable.length, text)
        setSelection(text.length)
    }

    /** The app's selection, kept inside the text. */
    fun select(start: Int, end: Int) = quietly { setSelection(minOf(start, text.length), minOf(end, text.length)) }

    private fun quietly(change: () -> Unit) {
        settingText = true
        try {
            change()
        } finally {
            settingText = false
        }
    }

    /** A format answers the user's edits (`formats`, docs/keyboard.md#formatting). */
    var formats = false

    /** Sends the field's text as the user changed it. */
    var onChange: ((String) -> Unit)? = null

    /** Sends an edit for the format to answer; true once the UI thread has, before it returned. */
    var onFormat: ((String, Int, Int) -> Boolean)? = null

    // The keyboard's batch of edits in progress: a format waits for its end,
    // since the keyboard's next edit in it counts on the text it made.
    private var batching = false

    // The user's text since the last change sent, and since the last format.
    private var unreported = false
    private var unformatted = false

    private val composing get() = BaseInputConnection.getComposingSpanStart(text) != -1

    /**
     * The user changed the text (the TextWatcher's afterTextChanged). A field
     * with a format sends the edit once the keyboard's batch ends, and reports
     * the change once the UI thread answered, before the frame; one the JS
     * thread answers, it reports itself. A composition in progress reports
     * its text as typed and formats once it commits.
     */
    fun userEdited() {
        if (settingText) return

        if (!formats) {
            onChange?.invoke(text.toString())

            return
        }

        unreported = true
        unformatted = true

        if (!batching) formatEdit()
    }

    override fun onBeginBatchEdit() {
        super.onBeginBatchEdit()
        batching = true
    }

    // A composition the keyboard finished without an edit formats here too.
    override fun onEndBatchEdit() {
        super.onEndBatchEdit()
        batching = false

        if (formats && (unreported || unformatted)) formatEdit()
    }

    private fun formatEdit() {
        if (composing) {
            if (unreported) onChange?.invoke(text.toString())
            unreported = false

            return
        }

        if (!unformatted) return

        val before = selectionStart to selectionEnd

        unreported = false
        unformatted = false

        if (onFormat?.invoke(text.toString(), before.first, before.second) != true) return

        onChange?.invoke(text.toString())

        // The format's caret is the user's: their edit moved it.
        if (emitsSelection && (selectionStart to selectionEnd) != before) onSelection?.invoke(selectionStart, selectionEnd)
    }

    // TextView calls it from its constructor too, before this class's fields are set.
    override fun onSelectionChanged(selStart: Int, selEnd: Int) {
        super.onSelectionChanged(selStart, selEnd)

        if (selStart == knownStart && selEnd == knownEnd) return

        knownStart = selStart
        knownEnd = selEnd

        if (emitsSelection && !settingText) onSelection?.invoke(selStart, selEnd)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        focusIfNeeded()
    }

    /** Once on screen, after the batch that placed it has laid out. */
    private fun focusIfNeeded() {
        if (!autoFocus || !isAttachedToWindow) return

        autoFocus = false
        post { KuitoFocus.focus(this) }
    }
}
