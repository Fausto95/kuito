package dev.kuito.runtime.logbox

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.TextUtils
import android.text.style.BackgroundColorSpan
import android.text.style.ForegroundColorSpan
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import dev.kuito.runtime.devtools.KuitoDevTheme
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * One LogBox entry in full: the message, the code that produced it, and the
 * call stack with Kuito's own frames folded away. Frames open in the editor.
 */
class KuitoLogInspector(
    context: Context,
    private val logBox: KuitoLogBox,
    private var entryId: String,
    /** Whether the dev server is reachable, so frames can still arrive. */
    private val connected: Boolean,
    private val onOpen: (file: String, line: Int, column: Int) -> Unit,
    private val onReload: () -> Unit,
) : BottomSheetDialog(context, com.google.android.material.R.style.Theme_Material3_Dark_BottomSheetDialog) {
    private val content = column(18f)
    private var showsFramework = false
    private var fatal = false
    private var observation: UUID? = null
    private val time = SimpleDateFormat("HH:mm:ss", Locale.US)

    init {
        content.setPadding(dp(20f), dp(24f), dp(20f), dp(20f))

        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            addView(ScrollView(context).apply { addView(content) }, LinearLayout.LayoutParams(-1, 0, 1f))
            addView(actions(), LinearLayout.LayoutParams(-1, -2).apply {
                setMargins(dp(16f), dp(8f), dp(16f), dp(16f))
            })
        }

        setContentView(root)
        // The navigation bar continues the sheet down to the screen's edge.
        window?.navigationBarColor = KuitoDevTheme.ink
        behavior.state = BottomSheetBehavior.STATE_EXPANDED
        behavior.skipCollapsed = true

        setOnShowListener {
            findViewById<FrameLayout>(com.google.android.material.R.id.design_bottom_sheet)?.apply {
                background = KuitoDevTheme.sheet(context)
                layoutParams = layoutParams.apply { height = ViewGroup.LayoutParams.MATCH_PARENT }
            }
            observation = logBox.observe(::refresh)
        }
        setOnDismissListener { observation?.let(logBox::unobserve) }
    }

    /** Turns to the entry, like a failure that arrived while the LogBox was open. */
    fun turnTo(id: String) {
        entryId = id
        showsFramework = false
        refresh()
    }

    private fun refresh() {
        val entries = logBox.entries
        val found = entries.indexOfFirst { it.id == entryId }

        // A fixed failure closes its LogBox; a dismissed entry shows the next one.
        if (entries.isEmpty() || (found < 0 && fatal)) return dismiss()

        val index = if (found >= 0) found else entries.lastIndex
        val entry = entries[index]

        entryId = entry.id
        fatal = entry.level == KuitoLogBox.Level.FATAL
        setCancelable(!fatal)
        content.removeAllViews()
        content.addView(header(entry, index, entries.size))
        content.addView(message(entry))
        entry.codeFrame?.let { content.addView(source(it)) }
        content.addView(stack(entry))
    }

    // Sections

    private fun header(entry: KuitoLogBox.Entry, position: Int, total: Int) = LinearLayout(context).apply {
        gravity = Gravity.CENTER_VERTICAL

        val tint = color(entry.level)
        val chip = label(levelName(entry.level).uppercase(), 11f, tint, bold = true).apply {
            background = KuitoDevTheme.rounded(context, KuitoDevTheme.withAlpha(tint, 0.16f), 8f, null)
            setPadding(dp(8f), dp(4f), dp(8f), dp(4f))
        }
        val clock = time.format(Date(entry.at))
        val whenText = if (entry.count > 1) "×${entry.count} · last at $clock" else clock

        addView(chip)
        addView(label(whenText, 12f, KuitoDevTheme.muted, mono = true),
            LinearLayout.LayoutParams(0, -2, 1f).apply { marginStart = dp(10f) })
        addView(iconButton("‹", position > 0) { page(-1) })
        addView(label("${position + 1} / $total", 13f, KuitoDevTheme.text, bold = true, mono = true))
        addView(iconButton("›", position < total - 1) { page(1) })
        addView(iconButton("✕", true) { dismiss() }, LinearLayout.LayoutParams(dp(40f), dp(40f)).apply { marginStart = dp(8f) })
    }

    private fun message(entry: KuitoLogBox.Entry) = column(8f).apply {
        addView(label(entry.title, 22f, KuitoDevTheme.text, bold = true))

        val rest = entry.message.substringAfter('\n', "")

        if (rest.isNotEmpty()) addView(label(rest, 15f, KuitoDevTheme.muted))
    }

    /** The code frame, with the failing line lit and its location a link. */
    private fun source(code: KuitoLogBox.CodeFrame) = column(8f).apply {
        addView(label("${code.file}:${code.line}:${code.column}  ↗", 13f, KuitoDevTheme.accent, bold = true, mono = true).apply {
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.START
            setOnClickListener { open(it, code.file, code.line, code.column) }
        })

        // Lines are padded to one width so the failing line's tint spans the card.
        val lines = code.text.split('\n')
        val width = lines.maxOf { it.length } + 2
        val text = SpannableStringBuilder()

        lines.forEachIndexed { offset, line ->
            val number = line.substringBefore('|').trim().toIntOrNull()
            val caret = line.trim().startsWith(":")
            val shown = (if (caret) line.replace(':', ' ') else line).padEnd(width)
            val start = text.length

            if (offset > 0) text.append('\n')
            text.append(shown)

            val color = when {
                caret -> KuitoDevTheme.danger
                number == code.line -> KuitoDevTheme.text
                else -> KuitoDevTheme.muted
            }

            text.setSpan(ForegroundColorSpan(color), start, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)

            if (number == code.line)
                text.setSpan(BackgroundColorSpan(KuitoDevTheme.withAlpha(KuitoDevTheme.danger, 0.18f)),
                    start, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }

        val frame = label("", 12.5f, KuitoDevTheme.muted, mono = true).apply {
            this.text = text
            setPadding(dp(14f), dp(12f), dp(14f), dp(12f))
        }
        val scroller = HorizontalScrollView(context).apply {
            isHorizontalScrollBarEnabled = false
            addView(frame)
        }
        // Long lines start scrolled so the caret is in view.
        val gutter = lines.firstOrNull { it.contains('|') }?.indexOf('|')?.plus(2) ?: 0
        val caret = frame.paint.measureText("0") * (gutter + code.column - 1) + dp(14f)

        scroller.post { scroller.scrollTo((caret - scroller.width * 0.6f).toInt().coerceAtLeast(0), 0) }
        addView(card(scroller))
    }

    private fun stack(entry: KuitoLogBox.Entry) = column(8f).apply {
        addView(label("CALL STACK", 12f, KuitoDevTheme.muted, bold = true))

        if (entry.frames.isEmpty()) {
            val raw = (if (connected) listOf("Mapping to your source…", "") else emptyList()) + entry.rawFrames

            addView(if (entry.rawFrames.isEmpty()) label("No stack trace", 14f, KuitoDevTheme.muted)
                else label(raw.joinToString("\n"), 12f, KuitoDevTheme.muted, mono = true))

            return@apply
        }

        val app = entry.frames.filter { it.kind == "app" }
        val framework = entry.frames.size - app.size
        val rows = column(0f)

        // An error inside Kuito has no app frames; its own frames are the story.
        for (frame in if (showsFramework || app.isEmpty()) entry.frames else app) rows.addView(row(frame))

        addView(card(rows))

        if (framework > 0 && app.isNotEmpty()) addView(label(
            if (showsFramework) "Hide Kuito and library frames" else "Show $framework Kuito and library frames",
            13f, KuitoDevTheme.muted, bold = true,
        ).apply {
            setOnClickListener {
                showsFramework = !showsFramework
                refresh()
            }
        })
    }

    private fun row(frame: KuitoLogBox.Frame) = LinearLayout(context).apply {
        gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(14f), dp(10f), dp(14f), dp(10f))

        val app = frame.kind == "app"

        addView(column(2f).apply {
            addView(label(frame.name.ifEmpty { "<anonymous>" }, 13.5f, if (app) KuitoDevTheme.text else KuitoDevTheme.muted, bold = true, mono = true))
            addView(label(frame.location ?: frame.kind, 11.5f, KuitoDevTheme.muted, mono = true).apply {
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.START
            })
        }, LinearLayout.LayoutParams(0, -2, 1f))

        val file = frame.file
        val line = frame.line

        if (file != null && line != null) {
            addView(label("↗", 16f, KuitoDevTheme.muted))
            setOnClickListener { open(it, file, line, frame.column ?: 1) }
        }
    }

    private fun actions() = LinearLayout(context).apply {
        addView(button("Dismiss", filled = false) { logBox.dismiss(entryId) }, LinearLayout.LayoutParams(0, dp(52f), 1f))
        addView(button("Copy", filled = false) {
            val entry = logBox.entries.firstOrNull { it.id == entryId } ?: return@button
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

            clipboard.setPrimaryClip(ClipData.newPlainText("Kuito LogBox", logBox.report(entry)))
        }, LinearLayout.LayoutParams(0, dp(52f), 1f).apply { marginStart = dp(10f) })
        addView(button("Reload", filled = true) {
            dismiss()
            onReload()
        }, LinearLayout.LayoutParams(0, dp(52f), 1f).apply { marginStart = dp(10f) })
    }

    // Behaviour

    private fun page(step: Int) {
        val entries = logBox.entries
        val index = entries.indexOfFirst { it.id == entryId } + step

        if (index in entries.indices) turnTo(entries[index].id)
    }

    private fun open(view: View, file: String, line: Int, column: Int) {
        view.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK)
        onOpen(file, line, column)
    }

    // Pieces

    private fun color(level: KuitoLogBox.Level) =
        if (level == KuitoLogBox.Level.WARN) KuitoDevTheme.warning else KuitoDevTheme.danger

    private fun levelName(level: KuitoLogBox.Level) = when (level) {
        KuitoLogBox.Level.WARN -> "Warning"
        KuitoLogBox.Level.ERROR -> "Error"
        KuitoLogBox.Level.FATAL -> "Failed to run"
    }

    private fun dp(value: Float) = KuitoDevTheme.dp(context, value)

    private fun label(text: String, size: Float, color: Int, bold: Boolean = false, mono: Boolean = false) = TextView(context).apply {
        this.text = text
        textSize = size
        setTextColor(color)
        typeface = Typeface.create(if (mono) Typeface.MONOSPACE else Typeface.DEFAULT, if (bold) Typeface.BOLD else Typeface.NORMAL)
    }

    private fun column(spacing: Float) = object : LinearLayout(context) {
        init {
            orientation = VERTICAL
            showDividers = SHOW_DIVIDER_MIDDLE
            dividerDrawable = android.graphics.drawable.ShapeDrawable().apply {
                intrinsicHeight = dp(spacing)
                paint.color = Color.TRANSPARENT
            }
        }
    }

    private fun card(body: View) = FrameLayout(context).apply {
        background = KuitoDevTheme.rounded(context, KuitoDevTheme.surface, 16f)
        clipToOutline = true
        addView(body)
    }

    private fun iconButton(symbol: String, enabled: Boolean, action: () -> Unit) = label(symbol, 20f, KuitoDevTheme.text, bold = true).apply {
        gravity = Gravity.CENTER
        alpha = if (enabled) 1f else 0.3f
        isEnabled = enabled
        setPadding(dp(10f), 0, dp(10f), 0)
        setOnClickListener { action() }
    }

    private fun button(title: String, filled: Boolean, action: () -> Unit) = Button(context).apply {
        text = title
        isAllCaps = false
        textSize = 15f
        setTextColor(KuitoDevTheme.text)
        background = KuitoDevTheme.rounded(context, if (filled) KuitoDevTheme.accent else KuitoDevTheme.raised, 26f, null)
        stateListAnimator = null
        setOnClickListener { action() }
    }
}
