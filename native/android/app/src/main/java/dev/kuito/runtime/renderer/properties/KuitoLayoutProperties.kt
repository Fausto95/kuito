package dev.kuito.runtime.renderer.properties

import android.view.View
import dev.kuito.runtime.renderer.KuitoValue
import dev.kuito.runtime.renderer.layout.layOutEveryView
import dev.kuito.runtime.renderer.layout.relayOut
import dev.kuito.runtime.renderer.views.KuitoListView

/**
 * Visibility, padding, size, position and flexbox layout, applied to the
 * view's node in the shared layout engine (native/shared/layout).
 */
internal object KuitoLayoutProperties {
    val setters: Map<String, KuitoPropertySetter> = mapOf(
        "hidden" to layout { context, value -> context.view.visibility = if (value == KuitoValue.Bool(true)) View.GONE else View.VISIBLE },
        "padding" to layout(),
        "paddingTop" to layout(),
        "paddingRight" to layout(),
        "paddingBottom" to layout(),
        "paddingLeft" to layout(),
        "paddingInlineStart" to layout(),
        "paddingInlineEnd" to layout(),
        "width" to layout(),
        "height" to layout(),
        "minWidth" to layout(),
        "maxWidth" to layout(),
        "minHeight" to layout(),
        "maxHeight" to layout(),
        "aspectRatio" to layout(),
        "alignItems" to layout(),
        "justifyContent" to layout(),
        // A list spaces its rows and a grid's columns by its gaps, as a flex
        // container would; a stylesheet's `gap` arrives as the two longhands.
        "gap" to layout { context, value ->
            val list = context.view as? KuitoListView ?: return@layout
            val gap = points(value).coerceAtLeast(0f)

            list.setRowGap(gap)
            list.setColumnGap(gap)
        },
        "position" to layout(),
        "top" to layout(),
        "right" to layout(),
        "bottom" to layout(),
        "left" to layout(),
        "insetInlineStart" to layout(),
        "insetInlineEnd" to layout(),
        "margin" to layout(),
        "marginTop" to layout(),
        "marginRight" to layout(),
        "marginBottom" to layout(),
        "marginLeft" to layout(),
        "marginInlineStart" to layout(),
        "marginInlineEnd" to layout(),
        "rowGap" to layout { context, value -> (context.view as? KuitoListView)?.setRowGap(points(value).coerceAtLeast(0f)) },
        "columnGap" to layout { context, value -> (context.view as? KuitoListView)?.setColumnGap(points(value).coerceAtLeast(0f)) },
        "flexDirection" to layout(),
        "flexWrap" to layout(),
        "flexLineCount" to layout(),
        "flexGrow" to layout(),
        "flexShrink" to layout(),
        "flexBasis" to layout(),
        "flex" to layout(),
        "alignSelf" to layout(),
        "alignContent" to layout(),
        // Views inherit it, the pages in them included: every one in the window lays out again.
        "direction" to layout { context, _ -> context.view.rootView.layOutEveryView() },
        "boxSizing" to layout(),
    )

    /** Decoration props that also lay out: a border insets content, and overflow decides shrinking. */
    fun alsoLayOut(context: KuitoPropertyContext, value: KuitoValue) {
        context.style.layout.set(context.key, value)
        context.view.requestLayout()
    }

    /** A length in points; 0 for anything else. */
    private fun points(value: KuitoValue) = (value as? KuitoValue.Number)?.value?.toFloat() ?: 0f

    /**
     * The engine validates the value; [apply] mirrors it onto the view when
     * Android draws it too. A driven value lays out at once only the
     * subtree it can move.
     */
    private fun layout(apply: ((KuitoPropertyContext, KuitoValue) -> Unit)? = null): KuitoPropertySetter = { context, value ->
        val layout = context.style.layout

        if (context.style.driven) layout.change(context.key, value) else layout.set(context.key, value)
        apply?.invoke(context, value)
        if (context.style.driven) layout.relayOut(context.view) else context.view.requestLayout()
    }
}
