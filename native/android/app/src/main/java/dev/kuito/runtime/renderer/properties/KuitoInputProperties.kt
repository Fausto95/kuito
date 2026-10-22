package dev.kuito.runtime.renderer.properties

import dev.kuito.runtime.renderer.KuitoLinesValue
import dev.kuito.runtime.renderer.KuitoPropValues
import dev.kuito.runtime.renderer.KuitoValue
import dev.kuito.runtime.renderer.keyboard.KuitoEditText
import dev.kuito.runtime.renderer.keyboard.KuitoInputTraits

/**
 * What a field takes and how the keyboard helps: HTML's input type,
 * inputmode, autocomplete, autocapitalize, maxlength and spellcheck.
 */
internal object KuitoInputProperties {
    val setters: Map<String, KuitoPropertySetter> = mapOf(
        "type" to field { context, field, value ->
            val type = context.keyword(value)

            if (type !in KuitoInputTraits.TYPES) context.unsupportedValue(value, "expects one of its values")
            // UITextView shows a password's text, and the number and phone keyboards are single-line.
            if (field.multiline && type !in KuitoInputTraits.MULTILINE_TYPES) {
                context.unsupportedValue(value, "a field with lines takes type text, email, url or search")
            }

            field.traits = field.traits.copy(type = type)
        },
        "inputMode" to field { context, field, value ->
            val mode = keyword(context, value, KuitoInputTraits.MODES)

            if (field.multiline && mode != null && mode !in KuitoInputTraits.MULTILINE_MODES) {
                context.unsupportedValue(value, "a field with lines takes inputMode none, text, search, email or url")
            }

            field.traits = field.traits.copy(mode = mode)
        },
        "autoComplete" to field { context, field, value ->
            field.traits = field.traits.copy(autoComplete = keyword(context, value, KuitoInputTraits.HINTS))
        },
        "autoCapitalize" to field { context, field, value ->
            field.traits = field.traits.copy(capitalize = keyword(context, value, KuitoInputTraits.CAPITALIZATIONS))
        },
        "maxLength" to field { context, field, value ->
            val limit = if (value == KuitoValue.Null) null else context.number(value)

            if (limit != null && (limit < 0 || limit != Math.round(limit).toFloat())) {
                context.unsupportedValue(value, "expects a whole number of at least 0")
            }

            field.maxLength = limit?.toInt()
        },
        "spellCheck" to field { context, field, value ->
            field.traits = field.traits.copy(spellCheck = if (value == KuitoValue.Null) null else context.flag(value))
        },
        "emitsSelection" to field { context, field, value -> field.emitsSelection = context.flag(value) },
        "formats" to field { context, field, value -> field.formats = context.flag(value) },
        "selection" to field { context, field, value ->
            if (value == KuitoValue.Null) return@field field.select(field.text.length, field.text.length)

            val (start, end) = KuitoPropValues.selection(context.record(value))

            if (start < 0 || start > end) context.unsupportedValue(value, "expects { start, end }, whole offsets with start <= end")

            field.select(start, end)
        },
        // `lines` makes the kernel create the multi-line kind: a single-line field is only ever sent null.
        "lines" to remeasured(field { context, field, value ->
            when {
                field.multiline -> field.lines = lines(context, value)
                // Only lines={0}, falsy, keeps the single-line kind and still arrives.
                value != KuitoValue.Null -> context.unsupportedValue(value, "expects a whole count of at least 1, or { min, max }")
            }
        }),
    )

    /** A count of lines, or a `{ min, max }` range; null is 1 to no limit. */
    private fun lines(context: KuitoPropertyContext, value: KuitoValue): Pair<Int, Int?> {
        if (value == KuitoValue.Null) return 1 to null

        // C++ checked each count is whole; a count still has to be at least 1.
        fun count(count: Int): Int =
            if (count < 1) context.unsupportedValue(value, "expects a whole count of at least 1, or { min, max }") else count

        return when (val lines = KuitoPropValues.lines(context.record(value))) {
            is KuitoLinesValue.Count -> count(lines.value).let { it to it }
            is KuitoLinesValue.Range -> {
                val min = lines.value.min?.let(::count) ?: 1
                val max = lines.value.max?.let(::count)

                if (max != null && max < min) context.unsupportedValue(value, "expects min <= max")

                min to max
            }
        }
    }

    /** Null, or one of the table's keys. */
    private fun keyword(context: KuitoPropertyContext, value: KuitoValue, table: Map<String, *>): String? {
        if (value == KuitoValue.Null) return null

        val name = context.keyword(value)

        if (name !in table) context.unsupportedValue(value, "expects one of its values")

        return name
    }

    private fun field(apply: (KuitoPropertyContext, KuitoEditText, KuitoValue) -> Unit): KuitoPropertySetter = { context, value ->
        apply(context, context.view as? KuitoEditText ?: context.unsupportedProp(), value)
    }
}
