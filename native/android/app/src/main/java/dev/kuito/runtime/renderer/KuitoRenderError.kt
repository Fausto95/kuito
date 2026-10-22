package dev.kuito.runtime.renderer

/**
 * Every error the renderer throws. The engine discards the mutation and
 * reports it (docs/logbox.md); iOS's KuitoRenderError has the same four cases.
 */
sealed class KuitoRenderError(message: String) : RuntimeException(message) {
    /** The view takes no such prop or command: no table has it, or it is another kind's. */
    class UnsupportedProp(val prop: String, val view: String) : KuitoRenderError("$view takes no $prop")

    /** The prop or command takes no such value; [reason] says what it takes. */
    class UnsupportedValue(val prop: String, val value: String, val view: String, val reason: String) :
        KuitoRenderError("$prop on $view takes no $value: $reason")

    /** The mutation makes a tree the renderer cannot show: a number in use, an unknown kind, a page outside its container. */
    class InvalidTree(reason: String) : KuitoRenderError("Invalid tree: $reason")

    /** No view has the number. */
    class MissingView(val view: String) : KuitoRenderError("No view $view")

    /** Why a value was rejected, thrown below a setter or a command that has no context: the renderer turns it into [UnsupportedValue]. */
    class Rejection(val reason: String) : RuntimeException(reason)
}

/** The value as an error quotes it. */
internal val KuitoValue.quoted: String
    get() = when (this) {
        KuitoValue.Null -> "null"
        is KuitoValue.Number -> value.toString()
        is KuitoValue.Bool -> value.toString()
        is KuitoValue.Color -> "#%08x".format(rgba)
        is KuitoValue.Text -> "\"$value\""
        is KuitoValue.Enum -> "\"$text\""
        is KuitoValue.Json -> "\"$text\""
        is KuitoValue.Keys -> "${edits.size} key edits"
        is KuitoValue.Struct -> "structured value ${record.numbers} ${record.strings}"
    }
