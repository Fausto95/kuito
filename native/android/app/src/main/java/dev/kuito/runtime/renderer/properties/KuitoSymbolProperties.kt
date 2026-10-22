package dev.kuito.runtime.renderer.properties

import dev.kuito.runtime.renderer.KuitoPropValues
import dev.kuito.runtime.renderer.KuitoSymbolNameValue
import dev.kuito.runtime.renderer.KuitoValue
import dev.kuito.runtime.renderer.views.KuitoSymbolView
import dev.kuito.runtime.renderer.views.KuitoSymbols

/** A Symbol's name, size and weight; tintColor is Image's (docs/assets.md#symbols). */
internal object KuitoSymbolProperties {
    val setters: Map<String, KuitoPropertySetter> = mapOf(
        // A name, or { ios, android } names.
        "name" to symbol { view, value, context ->
            view.setName(
                when (val name = KuitoPropValues.name(context.record(value))) {
                    is KuitoSymbolNameValue.Name -> name.value
                    is KuitoSymbolNameValue.Platforms -> name.value.android.takeIf { it.isNotEmpty() }
                },
            )
        },
        "size" to symbol { view, value, context -> view.setSize(context.number(value)) },
        "weight" to symbol { view, value, context ->
            val weight = context.keyword(value)

            view.setWeight(weight.takeIf(KuitoSymbols.weights::contains) ?: context.unsupportedValue(value, "expects one of its values"))
        },
    )

    private fun symbol(apply: (KuitoSymbolView, KuitoValue, KuitoPropertyContext) -> Unit): KuitoPropertySetter =
        { context, value -> apply(context.view as? KuitoSymbolView ?: context.unsupportedProp(), value, context) }
}
