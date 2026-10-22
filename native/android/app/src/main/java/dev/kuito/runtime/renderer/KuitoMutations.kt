package dev.kuito.runtime.renderer

/** What a record of the host batch does; native/shared/Mutation.h's `Op`. */
object KuitoOp {
    const val CREATE = 1
    const val REMOVE = 2
    const val MOVE = 3
    const val FLATTEN = 4
    const val PROP = 5
    const val COMMAND = 6
    const val UI = 7
    const val UI_SCRIPT = 8
    const val UI_KERNEL = 9
    const val UI_BUNDLE = 10
}

/** A prop's value as the host batch typed it, by the prop's manifest kind (native/shared/Wire.h). */
sealed interface KuitoValue {
    data object Null : KuitoValue
    data class Number(val value: Double) : KuitoValue
    data class Bool(val value: Boolean) : KuitoValue
    data class Text(val value: String) : KuitoValue
    /** 0xRRGGBBAA. */
    data class Color(val rgba: Int) : KuitoValue
    /** Its index among the prop's manifest values, and that value. */
    data class Enum(val index: Int, val text: String) : KuitoValue
    data class Json(val text: String) : KuitoValue
    /** A list's keys as edits to the keys it has (docs/lists.md#keys). */
    data class Keys(val edits: List<KuitoKeyEdit>) : KuitoValue
    /** A structured prop's value as C++ laid it out by its schema; KuitoPropValues reads it. */
    data class Struct(val record: KuitoStructRecord) : KuitoValue

    /** The value as setters that still parse it take it: scalars, and text for colors, enums and JSON. */
    val untyped: Any?
        get() = when (this) {
            Null -> null
            is Number -> value
            is Bool -> value
            is Text -> value
            is Color -> "#%08x".format(rgba)
            is Enum -> text
            is Json -> text
            is Keys -> null
            is Struct -> null
        }
}

/**
 * One edit of a list's keys, applied to the keys the edits before it left:
 * native/shared/Mutation.h's `KeyEdit`. [index] is where the key lands; for a
 * removal, where it is. A move's index counts once the key has left its place.
 */
data class KuitoKeyEdit(val op: Op, val key: String, val index: Int) {
    enum class Op { INSERT, REMOVE, MOVE }
}

/**
 * One job's typed mutations (native/shared/Mutation.h) as parallel arrays:
 * record i is each array's entry i. [ints] holds a move's index, a create's
 * or flatten's flattened flag, a color or an enum's index; [texts] and
 * [names] are null where the record has none. A Keys value's edits are
 * [edits] (each edit's op and index, in turn) and [editKeys]; null elsewhere.
 * A Struct value's record is [recordNumbers] and [recordStrings]; null
 * elsewhere, and either is null when the record has none.
 */
class KuitoMutations(
    val ops: IntArray,
    val kinds: IntArray,
    val keys: IntArray,
    val ids: IntArray,
    val parents: IntArray,
    val ints: IntArray,
    val numbers: DoubleArray,
    val texts: Array<String?>,
    val names: Array<String?>,
    val edits: Array<IntArray?>,
    val editKeys: Array<Array<String>?>,
    val recordNumbers: Array<DoubleArray?>,
    val recordStrings: Array<Array<String>?>,
) {
    val size get() = ops.size

    fun text(index: Int) = texts[index].orEmpty()
    fun name(index: Int) = names[index].orEmpty()

    /** The prop a Prop record writes, by name. */
    fun propName(index: Int): String =
        if (keys[index] == NAMED_PROP) name(index) else KuitoProps.byKey[keys[index]]

    fun value(index: Int): KuitoValue = when (kinds[index]) {
        1 -> KuitoValue.Number(numbers[index])
        2 -> if (numbers[index] != 0.0) TRUE else FALSE
        3 -> KuitoValue.Text(text(index))
        4 -> KuitoValue.Color(ints[index])
        5 -> ENUMS[keys[index]][ints[index]]
        6 -> KuitoValue.Json(text(index))
        7 -> KuitoValue.Keys(keyEdits(index))
        8 -> KuitoValue.Struct(record(index))
        else -> KuitoValue.Null
    }

    /** native/shared/Wire.h checked each edit's op. */
    private fun keyEdits(index: Int): List<KuitoKeyEdit> {
        val numbers = edits[index] ?: IntArray(0)
        val keys = editKeys[index] ?: emptyArray()

        return keys.mapIndexed { edit, key -> KuitoKeyEdit(EDIT_OPS[numbers[edit * 2]], key, numbers[edit * 2 + 1]) }
    }

    private fun record(index: Int) = KuitoStructRecord(
        recordNumbers[index]?.asList() ?: emptyList(),
        recordStrings[index]?.asList() ?: emptyList(),
    )

    companion object {
        /** The key of a prop the manifest does not list: it goes by name. */
        const val NAMED_PROP = 0xffff
        private val EDIT_OPS = KuitoKeyEdit.Op.entries

        // Values a batch repeats, made once: an enum crosses as its index alone.
        private val TRUE = KuitoValue.Bool(true)
        private val FALSE = KuitoValue.Bool(false)
        private val ENUMS = KuitoProps.valuesByKey.map { values -> Array(values.size) { KuitoValue.Enum(it, values[it]) } }
    }
}
