package dev.kuito.runtime.renderer

/**
 * A structured prop's value as C++ laid it out (native/shared/Schema.h):
 * numbers and strings in its schema's order, which the generated value types
 * (KuitoPropValues.generated.kt) read back.
 */
data class KuitoStructRecord(val numbers: List<Double>, val strings: List<String>)

/**
 * Reads a record in its schema's order. C++ checked the value against the
 * same generated schema, so reading past the end is a bug in the generator.
 */
internal class KuitoStructReader(private val record: KuitoStructRecord) {
    private var nextNumber = 0
    private var nextString = 0

    fun number(): Double = record.numbers[nextNumber++]

    /** A count, an enum's index, or an `integer`, which C++ checked is whole. */
    fun integer(): Int = number().toInt()

    fun flag(): Boolean = number() != 0.0

    /** 0xRRGGBBAA. */
    fun color(): Int = number().toLong().toInt()

    fun string(): String = record.strings[nextString++]
}
