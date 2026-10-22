package dev.kuito.runtime.renderer.views

import android.annotation.SuppressLint
import android.content.Context
import android.view.ViewGroup
import dev.kuito.runtime.renderer.layout.KuitoFlexLayout
import kotlin.math.roundToInt

/**
 * ListCell: one row of a native list, created by JavaScript when the list
 * first names it and re-bound to other keys after that. It is the root of its
 * own layout tree: it lays out at the width it is measured with (a vertical
 * list's column) or at its content's width (a horizontal list).
 */
internal class KuitoListCell(context: Context) : KuitoFlexLayout(context) {
    var list: KuitoListView? = null

    /** The key JavaScript last rendered into this cell (`cellKey`). */
    var renderedKey: String? = null
        set(value) {
            field = value
            list?.cellChanged(this)
        }

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val node = node ?: return setMeasuredDimension(0, 0)
        val density = resources.displayMetrics.density
        val width = if (list?.horizontal == true) Float.NaN else MeasureSpec.getSize(widthSpec) / density

        node.calculate(width, Float.NaN, density)

        val box = node.box()

        setMeasuredDimension((box.width * density).roundToInt(), (box.height * density).roundToInt())
        measureChildren()
    }

    /** A view inside this row changed: the list measures it again. */
    override fun requestLayout() {
        super.requestLayout()
        list?.cellChanged(this)
    }
}

/**
 * A list slot: a cell id the list asked JavaScript to fill, the key it asked
 * for, and the shell showing it. The view exists once JavaScript created it.
 * [number] is the slot's in the list's cell table (native/shared/ListCells.h).
 */
internal class KuitoListSlot(val id: String, val number: Int) {
    /** The key the table gave it: KuitoListCells writes it, nothing else. */
    var key: String? = null
    var view: KuitoListCell? = null
    var shell: KuitoListShell? = null
    /** Shown by the list's sticky overlay: its shell keeps the row's size and shows nothing. */
    var pinned = false

    /** JavaScript rendered the requested key: the row can show. */
    val ready get() = view?.renderedKey != null && view?.renderedKey == key
}

/**
 * The RecyclerView's item: shows whichever slot holds its row, and nothing
 * at the row's last measured or estimated size until that row is rendered.
 */
@SuppressLint("ViewConstructor")
internal class KuitoListShell(context: Context, private val list: KuitoListView) : ViewGroup(context) {
    var slot: KuitoListSlot? = null
        private set
    private var showing = false

    fun host(slot: KuitoListSlot) {
        if (this.slot !== slot) release()

        this.slot = slot
        slot.shell = this
        show()
    }

    /**
     * Places the slot's view once it exists; it is visible when ready. Adding
     * the view lays it out, which reports back here before the view knows
     * its parent: the guard keeps that from adding it twice.
     */
    fun show() {
        val slot = slot ?: return
        val view = slot.view ?: return

        if (showing || slot.pinned) return

        showing = true

        try {
            val visibility = if (slot.ready) VISIBLE else INVISIBLE
            val flip = if (list.inverted) -1f else 1f
            var changed = false

            if (view.visibility != visibility) {
                view.visibility = visibility
                changed = true
            }

            if (list.horizontal) scaleX = flip else scaleY = flip

            if (view.parent !== this) {
                (view.parent as? ViewGroup)?.removeView(view)
                removeAllViews()
                addView(view)
                changed = true
            }

            // Shown or hidden, the row's size changes between estimate and content.
            if (changed) requestLayout()
        } finally {
            showing = false
        }
    }

    fun release() {
        val slot = slot ?: return

        if (slot.shell === this) slot.shell = null

        slot.view?.takeIf { it.parent === this }?.let(::removeView)
        this.slot = null
    }

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val slot = slot
        val key = slot?.key
        val view = slot?.view
        val crossSpec = if (list.horizontal) heightSpec else widthSpec
        val unspecified = MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED)

        if (key != null && view != null && slot.ready && !slot.pinned) {
            if (list.horizontal) view.measure(unspecified, unspecified) else view.measure(crossSpec, unspecified)
            list.recordSize(key, view.measuredWidth, view.measuredHeight)

            return setMeasuredDimension(view.measuredWidth, view.measuredHeight)
        }

        val length = list.placeholderLength(key)

        if (list.horizontal) setMeasuredDimension(length, list.crossExtent)
        else setMeasuredDimension(MeasureSpec.getSize(crossSpec), length)
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        val view = slot?.view?.takeIf { it.parent === this } ?: return

        view.layout(0, 0, view.measuredWidth, view.measuredHeight)
    }
}
