package dev.kuito.runtime.link

import dev.kuito.runtime.modules.KuitoErrorCode
import dev.kuito.runtime.modules.KuitoModuleError

/**
 * An argument, or a part of one, as it crossed the host boundary: decoded
 * into the type the spec declares, or an `ERR_ARGUMENT` naming where it
 * failed. The kernel checked it against the same spec, so a failure here is
 * a spec and a stub that disagree.
 *
 * What crosses (native/shared/Link.h): null, Double, Boolean, String, a
 * direct [java.nio.ByteBuffer] for an ArrayBuffer's bytes, an
 * `Array<Any?>` for a list or a spec's struct (its fields in declared order,
 * src/cli/link-signature.ts) and [KuitoEntries] for string-keyed entries.
 */
class KuitoArgument(private val raw: Any?, private val path: String) {
    fun number(): Double = (raw as? Number)?.toDouble() ?: throw mismatch("a number")

    fun string(): String = raw as? String ?: throw mismatch("a string")

    fun bool(): Boolean = raw as? Boolean ?: throw mismatch("true or false")

    /** An ArrayBuffer's bytes, shared with it: see docs/native-modules.md#bytes. */
    fun bytes(): java.nio.ByteBuffer = raw as? java.nio.ByteBuffer ?: throw mismatch("an ArrayBuffer")

    /** Null and absent decode as null. */
    fun <T> optional(decode: (KuitoArgument) -> T): T? = if (raw == null) null else decode(this)

    fun <T> array(decode: (KuitoArgument) -> T): List<T> {
        val items = raw as? Array<*> ?: throw mismatch("an array")

        return items.mapIndexed { index, item -> decode(KuitoArgument(item, "$path[$index]")) }
    }

    fun <T> record(decode: (KuitoArgument) -> T): Map<String, T> {
        val entries = raw as? KuitoEntries ?: throw mismatch("an object")

        return entries.keys.indices.associate { index ->
            val key = entries.keys[index]

            key to decode(KuitoArgument(entries.values[index], "$path.$key"))
        }
    }

    fun <E> enumeration(values: Array<E>): E where E : Enum<E>, E : KuitoEnum {
        val wire = string()

        return values.firstOrNull { it.wire == wire } ?: throw mismatch("one of ${values.joinToString { "'${it.wire}'" }}")
    }

    /** A struct's field, by its place in the spec; one it lacks reads as null. */
    fun field(index: Int, name: String): KuitoArgument {
        val fields = raw as? Array<*> ?: throw mismatch("an object")

        return KuitoArgument(fields.getOrNull(index), "$path.$name")
    }

    /** The value as JSON data: null, Double, String, Boolean, and Lists and Maps of them. */
    fun json(): Any? = plain(raw)

    private fun mismatch(expected: String) = KuitoModuleError(KuitoErrorCode.ARGUMENT, "$path must be $expected")

    private companion object {
        fun plain(value: Any?): Any? = when (value) {
            is Array<*> -> value.map(::plain)
            is KuitoEntries -> value.keys.indices.associate { value.keys[it] to plain(value.values[it]) }
            else -> value
        }
    }
}
