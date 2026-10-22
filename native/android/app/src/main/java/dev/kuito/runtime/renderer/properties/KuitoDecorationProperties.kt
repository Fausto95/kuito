package dev.kuito.runtime.renderer.properties

import android.graphics.Color
import android.os.Build
import android.view.View
import android.view.ViewOutlineProvider
import dev.kuito.runtime.renderer.KuitoPropValues
import dev.kuito.runtime.renderer.KuitoValue
import dev.kuito.runtime.renderer.styling.KuitoViewStyle
import dev.kuito.runtime.renderer.styling.argb
import dev.kuito.runtime.renderer.views.KuitoScrolling

/** Corners, clipping, borders, shadows and background gradients. */
internal object KuitoDecorationProperties {
    val setters: Map<String, KuitoPropertySetter> = mapOf(
        "borderRadius" to restyle { style, context, value -> style.cornerRadius = context.number(value) },
        "borderWidth" to restyle { style, context, value ->
            val width = context.number(value)

            KuitoLayoutProperties.alsoLayOut(context, value)
            style.borderWidth = context.dp(width)
        },
        "borderColor" to restyle { style, context, value -> style.borderColor = context.color(value) },
        "backgroundGradient" to restyle { style, context, value ->
            val gradient = if (value == KuitoValue.Null) null else KuitoPropValues.backgroundGradient(context.record(value))

            style.gradientColors = gradient?.colors?.map(::argb)?.toIntArray()
            style.gradientAngle = gradient?.angle?.toFloat() ?: 180f
        },
        "overflow" to { context, value ->
            val overflow = if (value == KuitoValue.Null) null else context.keyword(value)

            KuitoLayoutProperties.alsoLayOut(context, value)
            val hidden = overflow == "hidden" || overflow == "scroll"

            // A scroll view clips its content whatever its overflow, as UIKit's does (KuitoScrolling).
            context.view.clipToOutline = hidden || context.view is KuitoScrolling
            context.layoutGroup()?.apply {
                clipChildren = hidden
                clipToPadding = hidden
            }
        },
        "shadowColor" to { context, value ->
            // Unset, the platform's own: black.
            val color = if (value == KuitoValue.Null) Color.BLACK else context.color(value)

            if (Build.VERSION.SDK_INT >= 28) {
                context.view.outlineSpotShadowColor = color
                context.view.outlineAmbientShadowColor = color
            }
        },
        // Android draws shadows from elevation; the blur radius maps to it,
        // and the light source (so the offset) is fixed by the platform.
        "shadowRadius" to { context, value -> context.view.elevation = context.dp(context.number(value)).toFloat() },
        "shadowOffsetX" to { context, value -> context.number(value) },
        "shadowOffsetY" to { context, value -> context.number(value) },
    )

    /** One background drawable carries color or gradient, corners and border. */
    fun decorate(view: View, style: KuitoViewStyle, density: Float) {
        view.background = style.background(density)
        view.outlineProvider = ViewOutlineProvider.BACKGROUND
    }

    private fun restyle(change: (KuitoViewStyle, KuitoPropertyContext, KuitoValue) -> Unit): KuitoPropertySetter =
        { context, value ->
            change(context.style, context, value)
            decorate(context.view, context.style, context.density)
        }
}
