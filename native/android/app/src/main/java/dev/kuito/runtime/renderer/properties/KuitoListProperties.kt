package dev.kuito.runtime.renderer.properties

import dev.kuito.runtime.renderer.KuitoPropValues
import dev.kuito.runtime.renderer.KuitoValue
import dev.kuito.runtime.renderer.views.KuitoListCell
import dev.kuito.runtime.renderer.views.KuitoListView

/** A native list's rows, columns and scroll requests, and the key a cell shows (docs/lists.md). */
internal object KuitoListProperties {
    val setters: Map<String, KuitoPropertySetter> = mapOf(
        "keys" to remeasured(on<KuitoListView> { context, view, value ->
            when (value) {
                is KuitoValue.Keys -> view.editKeys(value.edits)
                KuitoValue.Null -> view.clearKeys()
                else -> context.unsupportedValue(value, "expects a key diff")
            }
        }),
        "spanningKeys" to remeasured(on<KuitoListView> { context, view, value -> view.setSpanningKeys(KuitoPropValues.spanningKeys(context.record(value)).toSet()) }),
        "stickyKeys" to on<KuitoListView> { context, view, value -> view.setStickyKeys(KuitoPropValues.stickyKeys(context.record(value)).toSet()) },
        "numColumns" to remeasured(on<KuitoListView> { context, view, value ->
            view.setColumns(context.number(value).toInt().coerceAtLeast(1))
        }),
        "inverted" to on<KuitoListView> { context, view, value -> view.inverted = context.flag(value) },
        "estimatedItemSize" to remeasured(on<KuitoListView> { context, view, value ->
            view.setEstimatedLength(if (value == KuitoValue.Null) null else context.number(value).coerceAtLeast(1f))
        }),
        "initialScrollKey" to on<KuitoListView> { context, view, value ->
            view.initialScrollKey = if (value == KuitoValue.Null) null else context.text(value)
        },
        "emitsViewable" to on<KuitoListView> { context, view, value -> view.emitsViewable = context.flag(value) },
        "viewableThreshold" to on<KuitoListView> { context, view, value ->
            view.viewableThreshold = context.number(value).coerceIn(0f, 1f)
        },
        "cellKey" to on<KuitoListCell> { context, cell, value ->
            cell.renderedKey = if (value == KuitoValue.Null) null else context.text(value)
        },
    )
}
