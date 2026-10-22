package dev.kuito.runtime.renderer.properties

import dev.kuito.runtime.renderer.KuitoPropValues
import dev.kuito.runtime.renderer.KuitoValue
import dev.kuito.runtime.renderer.views.SheetPresentation
import dev.kuito.runtime.renderer.views.SnapPoint
import dev.kuito.runtime.renderer.views.KuitoSheetLayout

/** Sheet presentation: open state, how it presents, snap points and chrome. */
internal object KuitoSheetProperties {
    val setters: Map<String, KuitoPropertySetter> = mapOf(
        "open" to on<KuitoSheetLayout> { context, view, value -> view.open = context.flag(value) },
        "snapPoints" to on<KuitoSheetLayout> { context, view, value ->
            view.snapPoints = SnapPoint.list(KuitoPropValues.snapPoints(context.record(value)))
                ?: context.unsupportedValue(value, "expects heights in points, percentages such as \"50%\", or \"content\"")
        },
        "grabber" to on<KuitoSheetLayout> { context, view, value -> view.grabber = context.flag(value) },
        "dismissible" to on<KuitoSheetLayout> { context, view, value ->
            view.dismissible = context.flag(value)
        },
        "sheetCornerRadius" to on<KuitoSheetLayout> { context, view, value ->
            view.cornerRadius = if (value == KuitoValue.Null) KuitoSheetLayout.CORNER_RADIUS else context.number(value)
        },
        "presentation" to on<KuitoSheetLayout> { context, view, value ->
            view.presentation = SheetPresentation.of(context.keyword(value)) ?: context.unsupportedValue(value, "expects one of its values")
        },
    )
}
