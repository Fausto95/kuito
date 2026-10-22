package dev.kuito.runtime.renderer.views

import android.view.View

/**
 * The cells a list's rows are rendered into, and which shows which key. A
 * key keeps its cell; a new key takes the least recently used cell outside
 * the window, else a new one, and JavaScript is asked to render it
 * ([onBind]). The choice is the shared table's (native/shared/ListCells.h);
 * this keeps the views, as `KuitoListCells` does on iOS. Call [release]
 * once the list leaves Kuito's tree.
 */
internal class KuitoListCells(
    listId: String,
    private val onBind: (cell: String, key: String) -> Unit,
) {
    private var table = create(listId)
    private val slots = ArrayList<KuitoListSlot>()
    private val slotsByNumber = HashMap<Int, KuitoListSlot>()

    val all: List<KuitoListSlot> get() = slots

    /** The keys the list renders ahead: their cells are not reused. */
    fun setWindow(keys: List<String>) = setWindow(live(), keys.toTypedArray())

    /** The slot showing `key`: the one holding it, else the least recently used free one, else a new one. */
    fun slot(key: String): KuitoListSlot {
        val found = find(live(), key)

        if (found >= 0) slotsByNumber[found]?.let { return it }

        val held = slots.filter { it.shell != null || it.pinned }.map { it.number }.toIntArray()
        val number = place(live(), key, held)
        val slot = slotsByNumber[number] ?: add(number)

        slot.key = key
        slot.view?.visibility = View.INVISIBLE
        onBind(slot.id, key)

        return slot
    }

    /** The slot JavaScript's cell `id` fills: one this list named, or (after a reconnect) a new one. */
    fun adopt(cell: KuitoListCell, id: String): KuitoListSlot {
        val number = adopt(live(), id)

        return (slotsByNumber[number] ?: add(number)).also { it.view = cell }
    }

    /** Forgets `cell`'s slot; the slot it had, if any. */
    fun remove(cell: KuitoListCell): KuitoListSlot? {
        val slot = of(cell) ?: return null

        slots.remove(slot)
        slotsByNumber.remove(slot.number)
        remove(live(), slot.number)

        return slot
    }

    fun of(cell: KuitoListCell) = slots.firstOrNull { it.view === cell }

    /** A replayed cell joins with the key it shows, unless another holds that key. */
    fun join(slot: KuitoListSlot, key: String?) {
        if (key != null && join(live(), slot.number, key)) slot.key = key
    }

    /** The list has left Kuito's tree and its table is freed. */
    val released get() = table == 0L

    /** Frees the table: the list has left Kuito's tree. */
    fun release() {
        if (table == 0L) return

        destroy(table)
        table = 0L
    }

    private fun live() = table.also { check(it != 0L) { "List cells used after their list left: check `released` first" } }

    private fun add(number: Int) = KuitoListSlot(id(live(), number), number).also {
        slots += it
        slotsByNumber[number] = it
    }

    private companion object {
        init {
            System.loadLibrary("kuito_mobile")
        }

        @JvmStatic external fun create(list: String): Long
        @JvmStatic external fun destroy(table: Long)
        @JvmStatic external fun setWindow(table: Long, keys: Array<String>)
        @JvmStatic external fun find(table: Long, key: String): Int
        @JvmStatic external fun place(table: Long, key: String, held: IntArray): Int
        @JvmStatic external fun adopt(table: Long, id: String): Int
        @JvmStatic external fun join(table: Long, slot: Int, key: String): Boolean
        @JvmStatic external fun remove(table: Long, slot: Int)
        @JvmStatic external fun id(table: Long, slot: Int): String
    }
}
