package dev.kuito.runtime.renderer.views

import dev.kuito.runtime.renderer.KuitoKeyEdit

/** What one key edit did to the rows, as the list's adapter is told it. */
internal sealed interface KuitoKeyChange {
    data class Inserted(val at: Int) : KuitoKeyChange
    data class Removed(val at: Int) : KuitoKeyChange
    data class Moved(val from: Int, val to: Int) : KuitoKeyChange
}

/**
 * [keys] with each edit applied to the keys the edits before it left
 * (docs/lists.md#keys), and what each one did, by the shared editor
 * (native/shared/ListKeys.h). An edit that does not fit throws
 * [dev.kuito.runtime.renderer.KuitoRenderError.Rejection], naming it, and
 * leaves [keys] as they were.
 */
internal fun List<KuitoKeyEdit>.applied(keys: List<String>): Pair<List<String>, List<KuitoKeyChange>> {
    val edits = IntArray(size * 2)

    forEachIndexed { n, edit ->
        edits[n * 2] = edit.op.ordinal
        edits[n * 2 + 1] = edit.index
    }

    val packed = KuitoListKeys.edit(keys.toTypedArray(), edits, Array(size) { this[it].key })
    val count = packed[0]
    val order = List(count) { packed[1 + it].let { source -> if (source >= 0) keys[source] else this[source.inv()].key } }
    val changes = List(size) {
        val at = 1 + count + it * 3

        when (KuitoKeyEdit.Op.entries[packed[at]]) {
            KuitoKeyEdit.Op.INSERT -> KuitoKeyChange.Inserted(packed[at + 2])
            KuitoKeyEdit.Op.REMOVE -> KuitoKeyChange.Removed(packed[at + 1])
            KuitoKeyEdit.Op.MOVE -> KuitoKeyChange.Moved(packed[at + 1], packed[at + 2])
        }
    }

    return order to changes
}

private object KuitoListKeys {
    init {
        System.loadLibrary("kuito_mobile")
    }

    /** The keys' count, where each comes from (an index into [keys], or `~n` for the n-th edit's key), then each edit's op, from and to. */
    @JvmStatic external fun edit(keys: Array<String>, edits: IntArray, editKeys: Array<String>): IntArray
}
