package dev.kuito.runtime.renderer.properties

import dev.kuito.runtime.renderer.KuitoPropValues
import dev.kuito.runtime.renderer.KuitoValue
import dev.kuito.runtime.renderer.views.KuitoScrollable
import dev.kuito.runtime.renderer.views.KuitoScrolling
import kotlin.math.roundToInt

/** Scrolling behavior: events, end-reached, pull-to-refresh, indicators, requests and where a drag rests. */
internal object KuitoScrollProperties {
    val setters: Map<String, KuitoPropertySetter> = mapOf(
        "emitsScroll" to on<KuitoScrollable> { context, view, value -> view.emitsScroll = context.flag(value) },
        "scrollInterval" to on<KuitoScrollable> { context, view, value ->
            view.scrollEventThrottle = context.number(value).toLong().coerceAtLeast(0L)
        },
        "reachEndThreshold" to on<KuitoScrollable> { context, view, value ->
            view.endReachedThreshold = context.number(value).coerceAtLeast(0f)
        },
        "refreshable" to on<KuitoScrollable> { context, view, value -> view.refreshable = context.flag(value) },
        "refreshing" to on<KuitoScrollable> { context, view, value -> view.refreshShown = context.flag(value) },
        // A request, not state: each value received scrolls once; null drops one still waiting.
        "scrollTo" to on<KuitoScrollable> { context, view, value ->
            if (value == KuitoValue.Null) return@on view.cancelScroll()

            view.scroll(KuitoPropValues.scrollTo(context.record(value)))
        },
        "paging" to on<KuitoScrolling> { context, view, value -> view.snap.paging = context.flag(value) },
        "snapOffsets" to on<KuitoScrolling> { context, view, value ->
            view.snap.offsets = KuitoPropValues.snapOffsets(context.record(value)).map { offset ->
                (offset.toFloat() * context.density).roundToInt()
            }
        },
        // A view scrolls on one axis, so one flag covers its one scrollbar.
        "scrollbar" to on<KuitoScrollable> { context, view, value ->
            val shown = context.flag(value)

            view.showIndicator(vertical = true, shown)
            view.showIndicator(vertical = false, shown)
        },
    )
}
