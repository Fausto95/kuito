package dev.kuito.runtime.devtools

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.text.InputType
import android.text.format.DateUtils
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import com.google.android.material.bottomsheet.BottomSheetDialog
import java.util.UUID

/**
 * The devtools sheet: connection, Live Patch history, actions, monitors and
 * the last error. Opened with ⌘M or the menu key in the emulator, by shaking
 * a device, or with `m` in the `kuito dev` terminal.
 */
class KuitoDevtoolsSheet(context: Context, private val devtools: KuitoDevtools) :
    BottomSheetDialog(context, com.google.android.material.R.style.Theme_Material3_Dark_BottomSheetDialog) {
    private val statusDot = View(context)
    private val statusTitle = label("", 16f, KuitoDevTheme.text, bold = true)
    private val statusDetail = label("", 12f, KuitoDevTheme.muted, mono = true)
    private val patchList = column(10f)
    private val urlField = EditText(context)
    private val performance = Switch(context)
    private val highlights = Switch(context)
    private val errorCard = column(8f)
    private val errorText = label("", 12f, KuitoDevTheme.text, mono = true)
    private var observation: UUID? = null

    init {
        val content = column(14f).apply {
            setPadding(dp(20f), dp(24f), dp(20f), dp(28f))
            addView(header())
            addView(card(statusRow()))
            addView(actions())
            addView(errorSection())
            addView(section("LIVE PATCH", card(patchList)))
            addView(section("MONITORS", card(monitors())))
            addView(section("DEV SERVER", card(server())))
            addView(label("⌘M or menu in the emulator · shake a device · m in kuito dev", 12f, KuitoDevTheme.muted).apply {
                gravity = Gravity.CENTER
            })
        }

        setContentView(ScrollView(context).apply { addView(content) })
        // The navigation bar continues the sheet down to the screen's edge.
        window?.navigationBarColor = KuitoDevTheme.ink

        setOnShowListener {
            findViewById<FrameLayout>(com.google.android.material.R.id.design_bottom_sheet)?.background =
                KuitoDevTheme.sheet(context)
            observation = devtools.observe(::refresh)
        }
        setOnDismissListener { observation?.let(devtools::unobserve) }
    }

    private fun header() = LinearLayout(context).apply {
        gravity = Gravity.CENTER_VERTICAL

        addView(KuitoBrandMark(context), LinearLayout.LayoutParams(dp(36f), dp(36f)))
        addView(column(2f).apply {
            addView(label("Kuito Devtools", 20f, KuitoDevTheme.text, bold = true))
            addView(label("Hermes on device", 13f, KuitoDevTheme.muted))
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(12f) })
        addView(label("✕", 16f, KuitoDevTheme.muted).apply {
            setPadding(dp(8f), dp(4f), dp(8f), dp(4f))
            setOnClickListener { dismiss() }
        })
    }

    private fun statusRow() = LinearLayout(context).apply {
        gravity = Gravity.CENTER_VERTICAL
        addView(statusDot, LinearLayout.LayoutParams(dp(10f), dp(10f)))
        addView(column(4f).apply {
            addView(statusTitle)
            addView(statusDetail)
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(12f) })
    }

    private fun actions() = LinearLayout(context).apply {
        addView(button("Reload", filled = true) {
            devtools.reload()
            dismiss()
        }, LinearLayout.LayoutParams(0, dp(52f), 1f))
        addView(button("Reconnect", filled = false) { devtools.reconnect() },
            LinearLayout.LayoutParams(0, dp(52f), 1f).apply { marginStart = dp(12f) })
    }

    private fun errorSection(): View {
        errorCard.setPadding(dp(16f), dp(14f), dp(16f), dp(14f))
        errorCard.background = KuitoDevTheme.rounded(context, KuitoDevTheme.withAlpha(KuitoDevTheme.danger, 0.12f), 16f,
            KuitoDevTheme.withAlpha(KuitoDevTheme.danger, 0.35f))
        errorCard.addView(LinearLayout(context).apply {
            addView(label("Last error", 13f, KuitoDevTheme.danger, bold = true), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(label("Clear", 13f, KuitoDevTheme.muted).apply { setOnClickListener { devtools.clearError() } })
        })
        errorCard.addView(errorText)

        return errorCard
    }

    private fun monitors() = column(14f).apply {
        performance.setOnCheckedChangeListener { _, on -> devtools.showsPerformance = on }
        highlights.setOnCheckedChangeListener { _, on -> devtools.highlightsUpdates = on }
        tint(performance)
        tint(highlights)
        addView(toggleRow("Performance monitor", "FPS and frame times over your app", performance))
        addView(View(context).apply { setBackgroundColor(KuitoDevTheme.hairline) }, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1f)))
        addView(toggleRow("Highlight updates", "Flash views each time the renderer updates them", highlights))
    }

    private fun server() = column(10f).apply {
        urlField.setTextColor(KuitoDevTheme.text)
        urlField.typeface = Typeface.MONOSPACE
        urlField.textSize = 14f
        urlField.inputType = InputType.TYPE_TEXT_VARIATION_URI
        urlField.imeOptions = EditorInfo.IME_ACTION_GO
        urlField.isSingleLine = true
        urlField.background = KuitoDevTheme.rounded(context, KuitoDevTheme.ink, 10f, null)
        urlField.setPadding(dp(12f), 0, dp(12f), 0)
        urlField.setOnEditorActionListener { _, _, _ ->
            connectToField()
            true
        }
        addView(urlField, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(44f)))
        addView(button("Connect", filled = false) { connectToField() }, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48f)))
    }

    private fun refresh() {
        val (title, color) = when (val state = devtools.connection) {
            ConnectionState.Connected -> "Connected" to KuitoDevTheme.success
            ConnectionState.Connecting -> "Connecting…" to KuitoDevTheme.warning
            is ConnectionState.Retrying -> "Reconnecting in ${(state.delayMs + 999) / 1000}s" to KuitoDevTheme.warning
        }

        statusDot.background = KuitoDevTheme.rounded(context, color, 5f, null)
        statusTitle.text = title
        statusDetail.text = (devtools.connection as? ConnectionState.Retrying)?.reason ?: devtools.url

        if (!urlField.hasFocus()) urlField.setText(devtools.url)

        if (performance.isChecked != devtools.showsPerformance) performance.isChecked = devtools.showsPerformance
        if (highlights.isChecked != devtools.highlightsUpdates) highlights.isChecked = devtools.highlightsUpdates

        errorCard.visibility = if (devtools.lastError == null) View.GONE else View.VISIBLE
        errorText.text = devtools.lastError
        renderPatches()
    }

    private fun renderPatches() {
        patchList.removeAllViews()

        if (devtools.patches.isEmpty()) {
            patchList.addView(label("No updates yet. Save a file to patch the app live.", 14f, KuitoDevTheme.muted))

            return
        }

        for (patch in devtools.patches.take(5)) {
            patchList.addView(LinearLayout(context).apply {
                addView(label("rev ${patch.revision}", 13f, KuitoDevTheme.text, bold = true, mono = true))
                addView(label("%.0f ms".format(patch.milliseconds), 13f, KuitoDevTheme.success, mono = true),
                    LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(10f) })
                addView(label(DateUtils.getRelativeTimeSpanString(patch.at).toString(), 13f, KuitoDevTheme.muted))
            })
        }
    }

    private fun connectToField() {
        val text = urlField.text.toString().trim()

        if (!text.startsWith("ws://") && !text.startsWith("wss://"))
            return devtools.failed("“$text” is not a ws:// or wss:// URL")

        urlField.clearFocus()
        devtools.url = text
        devtools.reconnect()
    }

    // Building blocks

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

    private fun section(title: String, body: View) = column(10f).apply {
        addView(label(title, 12f, KuitoDevTheme.muted, bold = true))
        addView(body)
    }

    private fun card(body: View) = FrameLayout(context).apply {
        background = KuitoDevTheme.rounded(context, KuitoDevTheme.surface, 18f)
        setPadding(dp(16f), dp(16f), dp(16f), dp(16f))
        addView(body)
    }

    private fun toggleRow(title: String, detail: String, toggle: Switch) = LinearLayout(context).apply {
        gravity = Gravity.CENTER_VERTICAL
        addView(column(2f).apply {
            addView(label(title, 15f, KuitoDevTheme.text, bold = true))
            addView(label(detail, 13f, KuitoDevTheme.muted))
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        addView(toggle)
        // The whole row toggles, not only the switch.
        setOnClickListener { toggle.toggle() }
    }

    private fun tint(toggle: Switch) {
        val states = arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf())

        toggle.thumbTintList = ColorStateList(states, intArrayOf(Color.WHITE, Color.LTGRAY))
        toggle.trackTintList = ColorStateList(states, intArrayOf(KuitoDevTheme.accent, KuitoDevTheme.raised))
    }

    private fun button(title: String, filled: Boolean, action: () -> Unit) = Button(context).apply {
        text = title
        isAllCaps = false
        textSize = 15f
        setTextColor(KuitoDevTheme.text)
        background = KuitoDevTheme.rounded(context, if (filled) KuitoDevTheme.accent else KuitoDevTheme.raised, 14f, null)
        stateListAnimator = null
        setOnClickListener { action() }
    }
}
