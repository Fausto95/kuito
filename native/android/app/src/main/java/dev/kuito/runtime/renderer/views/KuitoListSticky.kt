package dev.kuito.runtime.renderer.views

import android.annotation.SuppressLint
import android.content.Context
import android.view.ViewGroup

/**
 * The pinned sticky row of a vertical list: it hosts that row's cell over
 * the RecyclerView, at the top of the viewport, while the row's own place
 * has scrolled above it. While pinned, the cell's shell in the RecyclerView
 * keeps the row's size and shows nothing. iOS pins in its layout instead
 * (`KuitoListLayout.pinned`); both pin the same row at the same place.
 */
@SuppressLint("ViewConstructor")
internal class KuitoListSticky(context: Context) : ViewGroup(context) {
    var slot: KuitoListSlot? = null
        private set

    init {
        visibility = GONE
    }

    /** Shows `slot`'s cell, moved `offset` px up by the next sticky row. */
    fun pin(slot: KuitoListSlot, offset: Int) {
        if (this.slot !== slot) release()

        this.slot = slot
        slot.pinned = true
        translationY = offset.toFloat()
        visibility = VISIBLE
        show()
    }

    private var showing = false

    /**
     * Takes the cell's view when it exists; visible once it is ready. Adding
     * the view lays it out, which reports back here before the view knows
     * its parent: the guard keeps that from adding it twice.
     */
    fun show() {
        val slot = slot ?: return
        val view = slot.view ?: return

        if (showing) return

        showing = true

        try {
            if (view.parent !== this) {
                (view.parent as? ViewGroup)?.removeView(view)
                removeAllViews()
                addView(view)
            }

            view.visibility = if (slot.ready) VISIBLE else INVISIBLE
        } finally {
            showing = false
        }
    }

    /** Gives the cell back to its shell. */
    fun release() {
        val slot = slot ?: return

        slot.pinned = false
        slot.view?.takeIf { it.parent === this }?.let(::removeView)
        this.slot = null
        visibility = GONE
        slot.shell?.show()
    }

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val view = slot?.view?.takeIf { it.parent === this }
        val width = MeasureSpec.getSize(widthSpec)

        if (view == null) return setMeasuredDimension(width, 0)

        view.measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED))
        setMeasuredDimension(width, view.measuredHeight)
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        val view = slot?.view?.takeIf { it.parent === this } ?: return

        view.layout(0, 0, view.measuredWidth, view.measuredHeight)
    }

    companion object {
        /**
         * The sticky row to pin and how far the next one pushes it up: the
         * last sticky position at or before the first visible row, unless
         * that row is the sticky one and still starts inside the viewport.
         * `topOf` is an attached row's top relative to the viewport; `length`
         * is the pinned row's.
         */
        fun pin(stickyPositions: List<Int>, first: Int, firstTop: Int, topOf: (Int) -> Int?, length: Int): Pair<Int, Int>? {
            val position = stickyPositions.lastOrNull { it <= first } ?: return null

            if (position == first && firstTop >= 0) return null

            val nextTop = stickyPositions.firstOrNull { it > position }?.let(topOf)

            return position to (if (nextTop != null) minOf(0, nextTop - length) else 0)
        }
    }
}
