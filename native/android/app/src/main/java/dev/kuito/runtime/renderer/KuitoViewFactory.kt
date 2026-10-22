package dev.kuito.runtime.renderer

import android.content.Context
import android.graphics.Color
import android.text.Editable
import android.text.TextWatcher
import android.view.KeyEvent
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.Switch
import dev.kuito.runtime.renderer.keyboard.KuitoEditText
import dev.kuito.runtime.renderer.keyboard.KuitoFocus
import dev.kuito.runtime.renderer.layout.KuitoFlexLayout
import dev.kuito.runtime.renderer.properties.KuitoPropertySetter
import dev.kuito.runtime.renderer.views.KuitoImageView
import dev.kuito.runtime.renderer.views.KuitoLabel
import dev.kuito.runtime.renderer.views.KuitoSymbolView
import dev.kuito.runtime.renderer.views.KuitoListCell
import dev.kuito.runtime.renderer.views.KuitoListView
import dev.kuito.runtime.renderer.views.KuitoNavigationScreenLayout
import dev.kuito.runtime.renderer.views.KuitoNavigationStackLayout
import dev.kuito.runtime.renderer.views.KuitoNavigationTabLayout
import dev.kuito.runtime.renderer.views.KuitoNavigationTabsLayout
import dev.kuito.runtime.renderer.views.KuitoHorizontalScroll
import dev.kuito.runtime.renderer.views.KuitoPressableLayout
import dev.kuito.runtime.renderer.views.KuitoSafeAreaLayout
import dev.kuito.runtime.renderer.views.KuitoSheetLayout
import dev.kuito.runtime.renderer.views.KuitoVerticalScroll

private typealias Make = (Context, Int, KuitoEventEmitter) -> View

/** Builds the Android view for each Kuito kind and wires its native events. */
internal object KuitoViewFactory {
    /**
     * Kinds that are pages of a container, by the container's kind: the
     * renderer hands them to that container and nowhere else.
     */
    val pages: Map<String, String> = mapOf(
        "NavigationScreen" to "NavigationStack",
        "NavigationTab" to "NavigationTabs",
    )

    private val kinds: Map<String, Make> = mapOf(
        "VStack" to { context, _, _ -> KuitoFlexLayout(context) },
        "HStack" to { context, _, _ -> KuitoFlexLayout(context) },
        "Pressable" to { context, id, events ->
            KuitoPressableLayout(context) { phase, location -> events.emit(id, phase, location) }
        },
        "Box" to { context, _, _ -> KuitoFlexLayout(context) },
        "SafeArea" to { context, _, _ -> KuitoSafeAreaLayout(context) },
        "Sheet" to { context, id, events ->
            KuitoSheetLayout(context) { event, payload -> events.emit(id, event, payload) }
        },
        "NavigationStack" to { context, id, events ->
            KuitoNavigationStackLayout(context) { event, payload -> events.emit(id, event, payload) }
        },
        "NavigationScreen" to { context, id, events ->
            KuitoNavigationScreenLayout(context) { event, payload -> events.emit(id, event, payload) }
        },
        "NavigationTabs" to { context, id, events ->
            KuitoNavigationTabsLayout(context) { index -> events.emit(id, "select", KuitoIndexPayload(index.toDouble())) }
        },
        "NavigationTab" to { context, id, events ->
            KuitoNavigationTabLayout(context) { error -> events.emit(id, "error", KuitoErrorPayload(error)) }
        },
        "Scroll" to { context, id, events ->
            KuitoVerticalScroll(context) { event, payload -> events.emit(id, event, payload) }
        },
        "HorizontalScroll" to { context, id, events ->
            KuitoHorizontalScroll(context) { event, payload -> events.emit(id, event, payload) }
        },
        "List" to { context, id, events ->
            KuitoListView(context, "__kuito:list-$id", horizontal = false) { event, payload -> events.emit(id, event, payload) }
        },
        "HorizontalList" to { context, id, events ->
            KuitoListView(context, "__kuito:list-$id", horizontal = true) { event, payload -> events.emit(id, event, payload) }
        },
        "ListCell" to { context, _, _ -> KuitoListCell(context) },
        "TextField" to { context, id, events -> textField(context, id, events, multiline = false) },
        "MultilineTextField" to { context, id, events -> textField(context, id, events, multiline = true) },
        "Image" to { context, id, events ->
            KuitoImageView(context) { phase, payload -> events.emit(id, phase, payload) }
        },
        "Symbol" to { context, _, _ -> KuitoSymbolView(context) },
        "Spacer" to { context, _, _ -> View(context) },
        "Divider" to { context, _, _ -> View(context).apply { setBackgroundColor(Color.LTGRAY) } },
        "Toggle" to { context, id, events ->
            Switch(context).apply { setOnCheckedChangeListener(events.switchChanged(id)) }
        },
        "Spinner" to { context, _, _ -> ProgressBar(context) },
        "Text" to { context, _, _ -> KuitoLabel(context) },
        "Button" to { context, id, events ->
            Button(context).apply { setOnClickListener { events.emit(id, "press") } }
        },
    )

    /** Whether a kind's view can be made: built in, or contributed by a native module. */
    fun has(kind: String) = kind in kinds || KuitoModuleViews.kind(kind) != null

    /** Makes a kind's view: built in, or contributed by a native module. */
    fun create(context: Context, kind: String, id: Int, events: KuitoEventEmitter): View {
        val make = kinds[kind] ?: KuitoModuleViews.kind(kind)?.make ?: throw KuitoRenderError.InvalidTree("no view kind is named $kind")

        return make(context, id, events)
    }

    /** Props a kind owns ahead of the shared tables in KuitoProperties: a module's view declares its own. */
    fun props(kind: String): Map<String, KuitoPropertySetter> = KuitoModuleViews.kind(kind)?.props.orEmpty()

    private fun textField(context: Context, id: Int, events: KuitoEventEmitter, multiline: Boolean) = KuitoEditText(context, multiline).apply {
        if (!multiline) setSingleLine()

        // In afterTextChanged, where a format may change the text it reports.
        addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}

            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}

            override fun afterTextChanged(s: Editable?) = userEdited()
        })

        onChange = { text -> events.emit(id, "change", KuitoTextPayload(text)) }
        onFormat = { text, start, end -> events.emit(id, "format", KuitoTextEdit(text, start.toDouble(), end.toDouble())) }

        setOnFocusChangeListener { _, hasFocus -> events.emit(id, if (hasFocus) "focus" else "blur") }
        onSubmit = { text -> events.emit(id, "submit", KuitoTextPayload(text)) }
        onSelection = { start, end -> events.emit(id, "selectionchange", KuitoTextSelection(start.toDouble(), end.toDouble())) }

        // Handled here rather than by Android's own focus search: submitBehavior
        // decides. A hardware Enter arrives on key down and key up; acting on
        // the up keeps it from reaching the next field, which would advance again.
        setOnEditorActionListener { _, _, key ->
            // A hardware Enter reaches here first: a field that adds lines lets it through.
            if (addsLines) return@setOnEditorActionListener false

            if (key == null || key.action == KeyEvent.ACTION_UP) {
                onSubmit?.invoke(text.toString())
                KuitoFocus.submitted(this)
            }

            true
        }
    }
}
