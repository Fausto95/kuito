package dev.kuito.runtime.renderer.properties

import dev.kuito.runtime.renderer.KuitoValue
import dev.kuito.runtime.renderer.views.KuitoPressableLayout

/** Pressable behavior: feedback, long-press delay and hit area. */
internal object KuitoPressProperties {
    val setters: Map<String, KuitoPropertySetter> = mapOf(
        "pressedOpacity" to pressable { view, value, context -> view.activeOpacity = context.number(value).coerceIn(0f, 1f) },
        "pressedScale" to pressable { view, value, context -> view.pressedScale = context.number(value).coerceAtLeast(0f) },
        "longPressDuration" to pressable { view, value, context ->
            view.longPressDuration = context.number(value).toLong().coerceAtLeast(0L)
        },
        "hitArea" to pressable { view, value, context -> view.hitSlop = context.dp(context.number(value).coerceAtLeast(0f)) },
        "haptic" to pressable { view, value, context -> view.haptic = if (value == KuitoValue.Null) null else context.keyword(value) },
    )

    private fun pressable(apply: (KuitoPressableLayout, KuitoValue, KuitoPropertyContext) -> Unit): KuitoPropertySetter =
        { context, value ->
            val view = context.view as? KuitoPressableLayout ?: context.unsupportedProp()

            apply(view, value, context)
        }
}
