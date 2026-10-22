package dev.kuito.runtime.modules

import dev.kuito.runtime.renderer.styling.KuitoParses
import dev.kuito.runtime.renderer.styling.strictHexColor
import org.json.JSONArray
import org.json.JSONObject

/**
 * How a module view's prop decodes from JSON ([KuitoViewDefinition.prop]).
 * Every decoder checks the value it gets, so a view receives exactly the type
 * it declared or the prop fails with `unsupportedValue`.
 */
fun interface KuitoType<A> {
    fun decode(value: Any): A

    companion object {
        val string = KuitoType { value -> value as? String ?: mismatch("a string", value) }
        val boolean = KuitoType { value -> value as? Boolean ?: mismatch("a boolean", value) }
        val double = KuitoType { value -> (value as? Number)?.toDouble() ?: mismatch("a number", value) }
        val int = KuitoType { value ->
            val number = value as? Number ?: mismatch("an integer", value)
            val whole = number.toDouble()
            if (whole != Math.floor(whole) || whole !in Int.MIN_VALUE.toDouble()..Int.MAX_VALUE.toDouble())
                mismatch("an integer", value)
            whole.toInt()
        }
        val obj = KuitoType { value -> value as? JSONObject ?: mismatch("an object", value) }
        val array = KuitoType { value -> value as? JSONArray ?: mismatch("an array", value) }

        /** CSS hex text (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) as an Android color int. */
        val color = KuitoType { value -> strictHexColor(KuitoParses.of(string.decode(value))) ?: mismatch("a CSS hex color", value) }

        /** An array whose every element decodes as [type]. */
        fun <A> list(type: KuitoType<A>) = KuitoType { value ->
            val elements = value as? JSONArray ?: mismatch("an array", value)
            List(elements.length()) { type.decode(elements.get(it)) }
        }

        /** null, an `undefined` argument, or a missing trailing one, as Kotlin null. */
        fun <A> optional(type: KuitoType<A>) = KuitoType { value -> if (value == JSONObject.NULL) null else type.decode(value) }

        /**
         * A string naming one of [constants] in camel case: `"light"` for
         * `LIGHT`, `"locationAlways"` for `LOCATION_ALWAYS`. Pass `Style.values()`.
         */
        fun <E : Enum<E>> enum(constants: Array<E>) = KuitoType { value ->
            constants.firstOrNull { camelCase(it.name) == value }
                ?: mismatch(constants.joinToString(" or ") { "\"${camelCase(it.name)}\"" }, value)
        }

        private fun camelCase(constant: String) = constant.lowercase().split('_').let { words ->
            words.first() + words.drop(1).joinToString("") { it.replaceFirstChar(Char::uppercase) }
        }

        private fun mismatch(expected: String, value: Any): Nothing =
            throw KuitoModuleError(KuitoErrorCode.ARGUMENT, "expected $expected, got ${if (value == JSONObject.NULL) "null" else value}")
    }
}
