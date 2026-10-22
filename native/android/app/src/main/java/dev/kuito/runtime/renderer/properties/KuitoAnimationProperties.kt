package dev.kuito.runtime.renderer.properties

import dev.kuito.runtime.renderer.KuitoPropValues
import dev.kuito.runtime.renderer.KuitoValue
import dev.kuito.runtime.renderer.styling.AnimatedProperty
import dev.kuito.runtime.renderer.styling.KuitoAnimationSpec
import dev.kuito.runtime.renderer.styling.KuitoFrameAnimator
import dev.kuito.runtime.renderer.styling.KuitoViewStyle
import dev.kuito.runtime.renderer.styling.applyTargets

/**
 * Animatable props (opacity, background color, transform), which apply at
 * once: their animations and CSS transitions run on the UI thread, which sets
 * them frame by frame, enter and exit effects too (docs/motion.md). Corners,
 * border color and shadows animate the same way through
 * [KuitoDecorationProperties], and width and height through a partial layout
 * ([dev.kuito.runtime.renderer.layout.relayOut]). `layout` animates the
 * view's frame changes with a native animator.
 */
internal object KuitoAnimationProperties {
    val setters: Map<String, KuitoPropertySetter> = mapOf(
        "opacity" to { context, value ->
            val opacity = context.number(value)
            val style = context.style

            style.opacity = opacity
            context.view.applyTargets(mapOf(AnimatedProperty.Alpha to style.effectiveOpacity))
        },
        "backgroundColor" to { context, value ->
            val style = context.style

            style.backgroundColor = if (value == KuitoValue.Null) null else context.color(value)
            KuitoDecorationProperties.decorate(context.view, style, context.density)
        },
        "translateX" to transform { style, value -> style.translateX = value },
        "translateY" to transform { style, value -> style.translateY = value },
        "scale" to transform { style, value -> style.scale = value },
        "scaleX" to transform { style, value -> style.scaleX = value },
        "scaleY" to transform { style, value -> style.scaleY = value },
        "rotate" to transform { style, value -> style.rotate = value },
        "exit" to { context, value -> context.style.exit = context.flag(value) },
        "exited" to { context, value -> context.style.exited = context.flag(value) },
        "layout" to { context, value ->
            context.style.layout.frameAnimator =
                if (value == KuitoValue.Null) null
                else KuitoFrameAnimator(KuitoAnimationSpec.of(KuitoPropValues.layout(context.record(value))))
        },
    )

    /** Transform components compose into one set of view transform targets. */
    private fun transform(assign: (KuitoViewStyle, Float) -> Unit): KuitoPropertySetter =
        { context, value ->
            val style = context.style

            assign(style, context.number(value))
            context.view.applyTargets(style.transformTargets(context.density))
        }
}
