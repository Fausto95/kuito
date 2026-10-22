package dev.kuito.runtime.renderer

// Structured prop values as C++ lays them out (native/shared/Schema.h): the
// numbers and strings of the prop's schema in order. Optional: presence 0/1
// then the value; list: count then items; oneOf: variant index then variant;
// color: 0xRRGGBBAA; enum: index.

internal class KuitoRecordBuilder {
    val numbers = mutableListOf<Double>()
    val strings = mutableListOf<String>()

    fun number(value: Number) {
        numbers += value.toDouble()
    }

    fun flag(value: Boolean) = number(if (value) 1 else 0)

    fun string(value: String) {
        strings += value
    }

    /** An optional field: its presence, then the value when present. */
    fun <T> optional(value: T?, write: (T) -> Unit) {
        flag(value != null)
        value?.let(write)
    }

    fun <T> list(items: List<T>, write: (T) -> Unit) {
        number(items.size)
        items.forEach(write)
    }
}

internal fun struct(write: KuitoRecordBuilder.() -> Unit): KuitoValue.Struct =
    KuitoRecordBuilder().apply(write).let { KuitoValue.Struct(KuitoStructRecord(it.numbers, it.strings)) }

internal fun stringList(vararg items: String) = struct { list(items.toList(), ::string) }

internal fun numberList(vararg items: Number) = struct { list(items.toList(), ::number) }

internal fun edges(vararg names: String) = struct { list(names.toList()) { name -> number(KuitoEdgeValue.entries.first { it.wire == name }.ordinal) } }

/** `{ angle, colors }`, colors as 0xRRGGBBAA. */
internal fun gradient(angle: Number, vararg colors: Long) = struct {
    number(angle)
    list(colors.toList()) { number(it) }
}

internal fun timingLayout(duration: Number, easing: List<Number> = listOf(0.42, 0.0, 0.58, 1.0), delay: Number = 0) = struct {
    number(0)
    string("timing")
    number(duration)
    list(easing, ::number)
    number(delay)
}

internal fun imageUrl(url: String) = struct {
    number(0)
    string(url)
}

internal fun remoteImage(uri: String, headers: Map<String, String>? = null) = struct {
    number(2)
    string(uri)
    optional(headers) { map ->
        number(map.size)
        map.forEach { (name, value) -> string(name); string(value) }
    }
}

internal fun symbolName(name: String) = struct {
    number(0)
    string(name)
}

internal fun tabSymbol(name: String) = struct {
    number(0)
    string(name)
}

internal fun lineCount(count: Int) = struct {
    number(0)
    number(count)
}

internal fun lineRange(min: Int?, max: Int?) = struct {
    number(1)
    optional(min, ::number)
    optional(max, ::number)
}

internal fun selection(start: Int, end: Int) = struct {
    number(start)
    number(end)
}

internal fun scrollToOffset(offset: Number, animated: Boolean? = null, request: Int = 1) = struct {
    number(2)
    number(offset)
    optional(animated, ::flag)
    number(request)
}

internal fun scrollToPage(page: Int, animated: Boolean? = null, request: Int = 1) = struct {
    number(3)
    number(page)
    optional(animated, ::flag)
    number(request)
}

internal fun scrollToEnd(animated: Boolean? = null, request: Int = 1) = struct {
    number(1)
    flag(true)
    optional(animated, ::flag)
    number(request)
}

internal fun snapPoints(vararg heights: Number) = struct { list(heights.toList()) { number(0); number(it) } }

internal fun actions(vararg names: String) = struct { list(names.toList()) { string(it); flag(false) } }

/** One gesture of the `gestures` list; config entries are numbers or booleans. */
internal class GestureSpec(val tag: Int, val type: String, val config: Map<String, Any>? = null)

internal fun gestures(vararg specs: GestureSpec) = struct {
    list(specs.toList()) { spec ->
        number(spec.tag)
        number(KuitoGestureTypeValue.entries.first { it.wire == spec.type }.ordinal)
        optional(spec.config) { config ->
            number(config.size)
            config.forEach { (key, value) ->
                string(key)
                when (value) {
                    is Boolean -> { number(1); flag(value) }
                    is Number -> { number(0); number(value) }
                    else -> error("A test gesture config takes numbers and booleans, not $value")
                }
            }
        }
        repeat(3) { flag(false) }
    }
}

/** A header item's icon, as HeaderIcon lays it out: a symbol, or names by platform. */
internal sealed interface HeaderIcon {
    data class Symbol(val name: String) : HeaderIcon
    data class Platforms(val ios: String?, val android: String?) : HeaderIcon
}

internal data class HeaderItem(val label: String, val icon: HeaderIcon? = null, val disabled: Boolean? = null, val leading: Boolean = false)

internal fun headerItems(vararg items: HeaderItem) = struct {
    list(items.toList()) { item ->
        string(item.label)
        optional(item.icon) { icon ->
            when (icon) {
                is HeaderIcon.Symbol -> { number(0); string(icon.name) }
                is HeaderIcon.Platforms -> {
                    number(1)
                    optional(icon.ios) { string(it) }
                    optional(icon.android) { string(it) }
                }
            }
        }
        optional(item.disabled) { flag(it) }
        // HeaderPlacement: leading 0, trailing 1.
        number(if (item.leading) 0 else 1)
    }
}

internal fun headerSearch(placeholder: String?) = struct { optional(placeholder) { string(it) } }
