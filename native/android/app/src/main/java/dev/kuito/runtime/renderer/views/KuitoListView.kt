package dev.kuito.runtime.renderer.views

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Rect
import android.os.SystemClock
import android.util.DisplayMetrics
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.recyclerview.widget.DefaultItemAnimator
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.LinearSmoothScroller
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import dev.kuito.runtime.renderer.keyboard.KuitoScrollKeyboard
import dev.kuito.runtime.renderer.layout.KuitoLayoutNode
import dev.kuito.runtime.renderer.layout.KuitoMeasureMode
import dev.kuito.runtime.renderer.layout.KuitoModeMeasured
import dev.kuito.runtime.renderer.layout.KuitoNativeState
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import dev.kuito.runtime.renderer.KuitoHost
import dev.kuito.runtime.renderer.KuitoKeyEdit
import dev.kuito.runtime.renderer.KuitoRenderError
import dev.kuito.runtime.renderer.KuitoStyled
import dev.kuito.runtime.renderer.KuitoTreeLinks
import dev.kuito.runtime.renderer.KuitoBindCellsPayload
import dev.kuito.runtime.renderer.KuitoEventPayload
import dev.kuito.runtime.renderer.KuitoScrollPayload
import dev.kuito.runtime.renderer.KuitoScrollRequestValue
import dev.kuito.runtime.renderer.KuitoViewableKeysPayload
import dev.kuito.runtime.renderer.styling.KuitoViewStyle

/**
 * List and HorizontalList: FlatList's native side (docs/lists.md). A
 * RecyclerView owns scrolling; this view owns the cells JavaScript renders
 * rows into. It decides which cell shows which key, asks JavaScript for a row
 * (`bind`) when the row comes within a screen of the viewport, and never
 * waits for the answer: a row not rendered yet shows blank at its last
 * measured or estimated size. Lengths are in pixels unless named dp.
 */
@SuppressLint("ViewConstructor")
internal class KuitoListView(
    context: Context,
    private val id: String,
    val horizontal: Boolean,
    private val emit: (String, KuitoEventPayload?) -> Unit,
) : SwipeRefreshLayout(context), KuitoScrollable, KuitoModeMeasured, KuitoHost, KuitoStyled, KuitoNativeState {
    override val keyboard = KuitoScrollKeyboard()
    private val recycler = object : RecyclerView(context) {
        override fun onInterceptTouchEvent(event: MotionEvent) =
            keyboard.intercepts(this, event) || super.onInterceptTouchEvent(event)

        override fun dispatchTouchEvent(event: MotionEvent): Boolean {
            keyboard.observe(this, event)

            return super.dispatchTouchEvent(event)
        }
    }

    override val scroller: ViewGroup get() = recycler
    override val vertical: Boolean get() = !horizontal

    /** The list's node in the screen's layout: its size follows its rows. */
    var node: KuitoLayoutNode? = null
    private val adapter = Adapter()
    private val density get() = resources.displayMetrics.density

    var keys: List<String> = emptyList()
        private set
    private var indexOfKey: Map<String, Int> = emptyMap()
    private var spanningKeys: Set<String> = emptySet()
    private var stickyKeys: Set<String> = emptySet()
    /** Positions of the sticky rows, in order. */
    var stickyPositions: List<Int> = emptyList()
        private set
    private val sticky = KuitoListSticky(context)
    private var columns = 1
    /** Between lines of a vertical list, as in a flex column. */
    private var rowGapPx = 0
    /** Between a grid's columns, and between rows of a horizontal list, as in a flex row. */
    private var columnGapPx = 0
    private val mainGapPx get() = if (horizontal) columnGapPx else rowGapPx
    private val stableIds = HashMap<String, Long>()

    private val sizes = KuitoListSizes(horizontal) { density }
    private val cells = KuitoListCells(id) { cell, key -> emit("bind", KuitoBindCellsPayload(cell, key)) }

    override fun releaseNative() {
        cells.release()
        // The engine frees the node next: a size update already posted must not reach it.
        node = null
    }

    private var forward = true

    private var lastScrollEvent = 0L
    private var endReachedCount = -1
    private var viewableRange: Pair<String, String>? = null
    private var initialScrollDone = false
    private var measurePending = false

    override var emitsScroll = false
    override val motion = KuitoScrollMotion(recycler, { scrolledPx }, emit)
    /**
     * The motion source's offset in px: the sum of the list's own scroll
     * deltas, exact as it moves. RecyclerView's scroll offset is an estimate
     * from average row sizes, which jumps as rows of other sizes bind; only a
     * jump to a row starts again from it.
     */
    private var scrolledPx = 0
    /** A jump to a row happened: the next scroll report starts from the estimate. */
    private var jumped = true
    override var scrollEventThrottle = 50L
    override var endReachedThreshold = 0.5f
    /** Turned on once something reads the visible rows: report them now, not at the next scroll. */
    var emitsViewable = false
        set(value) {
            val started = value && !field

            field = value

            if (started) {
                viewableRange = null
                post { scrolled() }
            }
        }
    var viewableThreshold = 0f

    override var refreshable = false
        set(value) {
            field = value
            isEnabled = value && !horizontal
        }

    override var refreshShown: Boolean
        get() = isRefreshing
        set(value) {
            isRefreshing = value
        }

    var inverted = false
        set(value) {
            field = value
            if (horizontal) recycler.scaleX = if (value) -1f else 1f else recycler.scaleY = if (value) -1f else 1f
            cells.all.forEach { it.shell?.show() }
            pad()
        }

    var initialScrollKey: String? = null
        set(value) {
            if (value != field) initialScrollDone = false
            field = value
            applyInitialScroll()
        }

    init {
        isEnabled = false
        setOnRefreshListener { emit("refresh", null) }
        recycler.clipToPadding = false
        recycler.itemAnimator = DefaultItemAnimator().apply { supportsChangeAnimations = false }
        recycler.adapter = adapter
        recycler.layoutManager = makeLayoutManager()
        recycler.addItemDecoration(Gaps())
        recycler.addOnScrollListener(object : RecyclerView.OnScrollListener() {
            override fun onScrolled(view: RecyclerView, dx: Int, dy: Int) {
                if (dx != 0 || dy != 0) forward = (if (horizontal) dx else dy) >= 0
                scrolledPx = if (jumped) estimatedOffset() else scrolledPx + if (horizontal) dx else dy
                jumped = false
                scrolled()
                motion.scrolled()
            }
        })
        recycler.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> post { scrolled() } }
        addView(recycler, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        // After the RecyclerView: SwipeRefreshLayout scrolls its first child and draws this over it.
        addView(sticky, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }

    // MARK: Data

    /** Applies a key diff whole, or throws and keeps the keys (docs/lists.md#keys). */
    fun editKeys(edits: List<KuitoKeyEdit>) {
        val (next, changes) = edits.applied(keys)

        show(next, changes)
    }

    fun clearKeys() = show(emptyList(), emptyList())

    /**
     * The adapter hears each change, so rows animate as inserted, removed and
     * moved; the first rows and the last load at once.
     */
    private fun show(next: List<String>, changes: List<KuitoKeyChange>) {
        val reload = keys.isEmpty() || next.isEmpty()

        keys = next
        indexOfKey = next.withIndex().associate { (index, key) -> key to index }
        indexSticky()
        next.forEach { key -> stableIds.getOrPut(key) { stableIds.size.toLong() } }

        if (reload) {
            @SuppressLint("NotifyDataSetChanged")
            adapter.notifyDataSetChanged()
        } else {
            for (change in changes) {
                when (change) {
                    is KuitoKeyChange.Inserted -> adapter.notifyItemInserted(change.at)
                    is KuitoKeyChange.Removed -> adapter.notifyItemRemoved(change.at)
                    is KuitoKeyChange.Moved -> adapter.notifyItemMoved(change.from, change.to)
                }
            }
        }

        applyInitialScroll()
        node?.markDirty()
        post { scrolled() }
    }

    fun setSpanningKeys(next: Set<String>) {
        spanningKeys = next
        (recycler.layoutManager as? GridLayoutManager)?.spanSizeLookup?.invalidateSpanIndexCache()
        recycler.invalidateItemDecorations()
    }

    fun setStickyKeys(next: Set<String>) {
        stickyKeys = next
        indexSticky()
        post { scrolled() }
    }

    private fun indexSticky() {
        stickyPositions = stickyKeys.mapNotNull { indexOfKey[it] }.sorted()
    }

    fun setColumns(count: Int) {
        if (count == columns) return

        columns = count
        recycler.layoutManager = makeLayoutManager()
    }

    fun setRowGap(dp: Float) {
        rowGapPx = (dp * density).roundToInt()
        recycler.invalidateItemDecorations()
    }

    fun setColumnGap(dp: Float) {
        columnGapPx = (dp * density).roundToInt()
        recycler.invalidateItemDecorations()
    }

    fun setEstimatedLength(dp: Float?) {
        sizes.estimatedPx = dp?.let { (it * density).roundToInt() }
    }

    /** A scroll request: `{ key, animated, align, margin }`, `{ offset, animated }` or `{ end, animated }`. */
    override fun scroll(request: KuitoScrollRequestValue) {
        when (request) {
            is KuitoScrollRequestValue.Key -> {
                val position = indexOfKey[request.value.key] ?: return
                val align = request.value.align?.toFloat() ?: 0f
                val margin = (request.value.margin?.toFloat() ?: 0f) * density

                scrollToPosition(position, align, margin.roundToInt(), request.value.animated ?: true)
            }
            is KuitoScrollRequestValue.End -> when {
                !request.value.end -> scrollToOffset(0f, request.value.animated ?: true)
                keys.isNotEmpty() -> scrollToPosition(keys.size - 1, 1f, 0, request.value.animated ?: true)
            }
            is KuitoScrollRequestValue.Offset -> scrollToOffset(request.value.offset.toFloat(), request.value.animated ?: true)
            is KuitoScrollRequestValue.Page ->
                throw KuitoRenderError.Rejection("a list scrolls to a key, an offset or its end; pages are a ScrollView's")
        }
    }

    /** Scrolls to [offset] in dp along the list's axis. */
    private fun scrollToOffset(offset: Float, animated: Boolean) {
        val delta = (offset * density).roundToInt() - currentOffset()

        if (animated) {
            if (horizontal) recycler.smoothScrollBy(delta, 0) else recycler.smoothScrollBy(0, delta)
        } else {
            if (horizontal) recycler.scrollBy(delta, 0) else recycler.scrollBy(0, delta)
        }
    }

    /** A request lands at once, so none is ever waiting. */
    override fun cancelScroll() = Unit

    // MARK: Cells

    /** JavaScript created the cell this list named, or (after a reconnect) one it joins the pool with. */
    override fun style(style: KuitoViewStyle, tree: KuitoTreeLinks) {
        node = style.layout
    }

    /** A row joins the pool under the id the list asked the kernel for. */
    override fun adopt(child: View, label: String, index: Int?) {
        val cell = child as? KuitoListCell ?: throw KuitoRenderError.InvalidTree("only a ListCell goes in a list")
        val slot = cells.adopt(cell, label)

        cell.list = this
        slot.shell?.show()
        cellChanged(cell)
    }

    /** Rows are placed by their keys, not by their place among the children. */
    override fun move(child: View, index: Int) {}

    override fun release(child: View, gone: () -> Unit) {
        (child as? KuitoListCell)?.let { cell ->
            cells.remove(cell)?.shell?.release()
            cell.list = null
        }
        (child.parent as? ViewGroup)?.removeView(child)
        gone()
    }

    override fun animatesRemoval(child: View) = false

    fun cellChanged(cell: KuitoListCell) {
        val slot = cells.of(cell) ?: return

        cells.join(slot, cell.renderedKey)

        if (slot.pinned) return sticky.show()

        val shell = slot.shell

        if (shell != null) {
            if ((cell.visibility == VISIBLE) != slot.ready) shell.show()

            return
        }

        // A row rendered ahead of the viewport is measured off screen, so its size is known before it shows.
        if (!measurePending) {
            measurePending = true
            post(::measureOffscreen)
        }
    }

    private fun measureOffscreen() {
        measurePending = false

        val width = recycler.width - recycler.paddingLeft - recycler.paddingRight
        val unspecified = MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED)

        for (slot in cells.all) {
            val key = slot.key ?: continue
            val view = slot.view ?: continue

            if (slot.shell != null || !slot.ready || !view.isLayoutRequested) continue

            val cross = if (horizontal) unspecified else MeasureSpec.makeMeasureSpec(columnWidth(key, width), MeasureSpec.EXACTLY)

            view.measure(if (horizontal) unspecified else cross, unspecified)
            view.layout(0, 0, view.measuredWidth, view.measuredHeight)
            recordSize(key, view.measuredWidth, view.measuredHeight)
        }
    }

    private fun columnWidth(key: String, width: Int) =
        if (columns == 1 || key in spanningKeys) width else max((width - columnGapPx * (columns - 1)) / columns, 0)

    // MARK: Sizes

    fun recordSize(key: String, width: Int, height: Int) {
        // A horizontal list is as tall as its tallest row: the screen lays out again.
        if (sizes.record(key, width, height)) post {
            node?.markDirty()
            requestLayout()
        }
    }

    fun placeholderLength(key: String?) = sizes.placeholderLength(key)

    val crossExtent: Int get() = sizes.crossExtent

    /** A scroll container clips its rows, whatever the renderer sets for views. */
    override fun setClipChildren(clipChildren: Boolean) = super.setClipChildren(true)

    /** The style's padding, the rows' inset: it scrolls with them, as a ScrollView's content padding does. */
    private val padding = Rect()
    private var keyboardInset = 0

    override fun setPadding(left: Int, top: Int, right: Int, bottom: Int) {
        padding.set(left, top, right, bottom)
        pad()
    }

    override fun insetKeyboard(px: Int) {
        if (px == keyboardInset) return

        keyboardInset = px
        pad()
    }

    // An inverted list is flipped: its top padding is at the bottom on screen.
    override fun lift(px: Int) = recycler.scrollBy(0, if (inverted) -px else px)

    private fun pad() {
        val (top, bottom) = if (inverted) keyboardInset to 0 else 0 to keyboardInset

        recycler.setPadding(padding.left, padding.top + top, padding.right, padding.bottom + bottom)
    }

    /**
     * The engine sizes a list from its rows: along the axis their total
     * length, across a horizontal list its tallest row. Its min-content
     * length is zero, unlike a CSS scroll container's content: rows scroll
     * into view, so a list never forces a flexible column taller.
     */
    override fun measure(width: Float, widthMode: Int, height: Float, heightMode: Int): Pair<Float, Float> {
        val length = (keys.sumOf { placeholderLength(it).toLong() } + mainGapPx.toLong() * max(keys.size - 1, 0)) / density
        val sized = widthMode == KuitoMeasureMode.EXACTLY || widthMode == KuitoMeasureMode.AT_MOST

        if (horizontal) return (if (widthMode == KuitoMeasureMode.MIN_CONTENT) 0f else length) to crossExtent / density

        return (if (sized) width else crossExtent / density) to (if (heightMode == KuitoMeasureMode.MIN_CONTENT) 0f else length)
    }

    // MARK: Scrolling

    private fun makeLayoutManager(): RecyclerView.LayoutManager {
        val orientation = if (horizontal) RecyclerView.HORIZONTAL else RecyclerView.VERTICAL

        if (columns == 1 || horizontal) return LinearLayoutManager(context, orientation, false)

        return GridLayoutManager(context, columns, orientation, false).apply {
            spanSizeLookup = object : GridLayoutManager.SpanSizeLookup() {
                override fun getSpanSize(position: Int) = if (keys.getOrNull(position) in spanningKeys) columns else 1
            }.apply { isSpanIndexCacheEnabled = true }
        }
    }

    private val linear get() = recycler.layoutManager as LinearLayoutManager

    private fun viewportLength() =
        if (horizontal) recycler.width - recycler.paddingLeft - recycler.paddingRight
        else recycler.height - recycler.paddingTop - recycler.paddingBottom

    private fun currentOffset() = if (horizontal) recycler.computeHorizontalScrollOffset() else recycler.computeVerticalScrollOffset()

    private fun jump(position: Int, offset: Int) {
        jumped = true
        linear.scrollToPositionWithOffset(position, offset)
    }

    private fun estimatedOffset() =
        if (horizontal) recycler.computeHorizontalScrollOffset() else recycler.computeVerticalScrollOffset()

    private fun scrollToPosition(position: Int, align: Float, margin: Int, animated: Boolean) {
        val length = placeholderLength(keys.getOrNull(position))
        val offset = (align * (viewportLength() - length)).roundToInt() + margin

        if (!animated) return jump(position, offset)

        // A far animated jump would fly past rows nobody has rendered: cut to
        // a screen before the target and animate the rest.
        val first = linear.findFirstVisibleItemPosition()
        val perScreen = max(viewportLength() / max(placeholderLength(null), 1), 1) * columns

        val far = first != RecyclerView.NO_POSITION && abs(position - first) > 3 * perScreen

        if (far) {
            val near = if (position > first) position - perScreen else position + perScreen

            jump(near.coerceIn(0, keys.size - 1), 0)
        }

        val scroller = object : LinearSmoothScroller(context) {
            override fun calculateDtToFit(viewStart: Int, viewEnd: Int, boxStart: Int, boxEnd: Int, snapPreference: Int) =
                boxStart + (align * (boxEnd - boxStart - (viewEnd - viewStart))).roundToInt() + margin - viewStart

            override fun calculateSpeedPerPixel(displayMetrics: DisplayMetrics) = 25f / displayMetrics.densityDpi
        }

        scroller.targetPosition = position

        // After a cut, animate once the list has laid out there.
        if (far) recycler.post { linear.startSmoothScroll(scroller) } else linear.startSmoothScroll(scroller)
    }

    private fun applyInitialScroll() {
        val key = initialScrollKey ?: return
        val position = indexOfKey[key] ?: return

        if (initialScrollDone) return

        initialScrollDone = true
        jump(position, 0)
    }

    private fun scrolled() {
        // A pass queued before the list left runs after it: removing a view
        // does not empty its handler's queue.
        if (cells.released) return

        val pinned = pinnedPosition()

        updateWindow(pinned?.first)
        pinSticky(pinned)
        checkEndReached()
        reportViewable()

        if (!emitsScroll) return

        val now = SystemClock.uptimeMillis()

        if (now - lastScrollEvent < scrollEventThrottle) return

        lastScrollEvent = now

        val x = recycler.computeHorizontalScrollOffset() / density
        val y = recycler.computeVerticalScrollOffset() / density

        emit("scroll", KuitoScrollPayload(
            x = x.toDouble(), y = y.toDouble(),
            contentWidth = (recycler.computeHorizontalScrollRange() / density).toDouble(),
            contentHeight = (recycler.computeVerticalScrollRange() / density).toDouble(),
            layoutWidth = (recycler.width / density).toDouble(), layoutHeight = (recycler.height / density).toDouble(),
        ))
    }

    /**
     * Rows within a screen ahead of the viewport (half a screen behind) get
     * a cell and are rendered before they scroll in.
     */
    private fun updateWindow(pinned: Int?) {
        if (keys.isEmpty() || recycler.width == 0 || recycler.height == 0) return

        val first = linear.findFirstVisibleItemPosition()
        val last = linear.findLastVisibleItemPosition()

        if (first == RecyclerView.NO_POSITION || last == RecyclerView.NO_POSITION) return

        val perScreen = ceil(viewportLength().toFloat() / max(placeholderLength(null), 1)).toInt() * columns
        val ahead = if (forward) perScreen else perScreen / 2
        val behind = if (forward) perScreen / 2 else perScreen
        val start = max(first - behind, 0)
        val end = min(last + ahead, keys.size - 1)

        // The pinned sticky row shows however far its own place has scrolled.
        val window = (start..end).toMutableList().apply { pinned?.takeIf { it < start || it > end }?.let(::add) }

        cells.setWindow(window.map { keys[it] })

        for (position in window) cells.slot(keys[position])
    }

    // MARK: Sticky rows

    /** The sticky row to pin at the top of the viewport, and how far the next one pushes it up. */
    private fun pinnedPosition(): Pair<Int, Int>? {
        if (stickyPositions.isEmpty() || horizontal) return null

        var first = RecyclerView.NO_POSITION
        var firstTop = 0

        // The first row reaching below the viewport's top; the padding scrolls with the rows.
        for (index in 0 until recycler.childCount) {
            val child = recycler.getChildAt(index)
            val position = recycler.getChildAdapterPosition(child)

            if (position == RecyclerView.NO_POSITION || child.bottom <= 0) continue

            if (first == RecyclerView.NO_POSITION || position < first) {
                first = position
                firstTop = child.top
            }
        }

        if (first == RecyclerView.NO_POSITION) return null

        val length = stickyPositions.lastOrNull { it <= first }?.let { placeholderLength(keys[it]) } ?: 0

        return KuitoListSticky.pin(stickyPositions, first, firstTop, { linear.findViewByPosition(it)?.top }, length)
    }

    private fun pinSticky(pinned: Pair<Int, Int>?) {
        val key = pinned?.let { keys.getOrNull(it.first) } ?: return sticky.release()

        sticky.pin(cells.slot(key), pinned.second)
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        super.onLayout(changed, left, top, right, bottom)

        // SwipeRefreshLayout lays out only its target and spinner: the overlay spans the rows' width.
        val width = max(recycler.width - recycler.paddingLeft - recycler.paddingRight, 0)

        sticky.measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED))
        sticky.layout(recycler.paddingLeft, 0, recycler.paddingLeft + width, sticky.measuredHeight)
    }

    /** Fires once per row count when the end comes within the threshold, as content shorter than the list does. */
    private fun checkEndReached() {
        val count = keys.size
        val visible = viewportLength()

        if (count == 0 || count == endReachedCount || visible <= 0) return

        val last = linear.findLastVisibleItemPosition()

        if (last == RecyclerView.NO_POSITION) return

        val view = linear.findViewByPosition(last) ?: return
        val end = if (horizontal) view.right - (recycler.width - recycler.paddingRight) else view.bottom - (recycler.height - recycler.paddingBottom)
        val rest = (last + 1 until count).sumOf { placeholderLength(keys[it]).toLong() + mainGapPx }
        val remaining = max(end, 0) + rest

        if (remaining > endReachedThreshold * visible) return

        endReachedCount = count
        emit("reachend", null)
    }

    private fun reportViewable() {
        if (!emitsViewable) return

        val viewport = Rect(recycler.paddingLeft, recycler.paddingTop, recycler.width - recycler.paddingRight, recycler.height - recycler.paddingBottom)
        val viewable = (0 until recycler.childCount).mapNotNull { index ->
            val child = recycler.getChildAt(index)
            val position = recycler.getChildAdapterPosition(child)
            val bounds = Rect(child.left, child.top, child.right, child.bottom)
            val length = if (horizontal) bounds.width() else bounds.height()

            if (position == RecyclerView.NO_POSITION || !bounds.intersect(viewport)) return@mapNotNull null

            val seen = if (horizontal) bounds.width() else bounds.height()

            position.takeIf { seen > 0 && (length == 0 || seen.toFloat() / length >= viewableThreshold) }
        }.sorted()
        val range = viewable.firstOrNull()?.let { keys[it] to keys[viewable.last()] }

        if (range == viewableRange) return

        viewableRange = range
        emit("viewable", KuitoViewableKeysPayload(range?.first ?: "", range?.second ?: ""))
    }

    override fun showIndicator(vertical: Boolean, shown: Boolean) {
        if (vertical) recycler.isVerticalScrollBarEnabled = shown else recycler.isHorizontalScrollBarEnabled = shown
    }

    /** The gap between rows and between a grid's columns. */
    private inner class Gaps : RecyclerView.ItemDecoration() {
        override fun getItemOffsets(outRect: Rect, view: View, parent: RecyclerView, state: RecyclerView.State) {
            val position = parent.getChildAdapterPosition(view)

            if (position <= 0) return

            val grid = parent.layoutManager as? GridLayoutManager

            if (grid == null) {
                if (horizontal) outRect.left = columnGapPx else outRect.top = rowGapPx

                return
            }

            val lookup = grid.spanSizeLookup
            val line = lookup.getSpanGroupIndex(position, columns)
            val column = lookup.getSpanIndex(position, columns)
            val span = lookup.getSpanSize(position)

            if (line > 0) outRect.top = rowGapPx

            // Equal column widths: each column gives up the same share of the gaps.
            if (span < columns) {
                outRect.left = column * columnGapPx / columns
                outRect.right = columnGapPx - (column + 1) * columnGapPx / columns
            }
        }
    }

    private class Holder(val shell: KuitoListShell) : RecyclerView.ViewHolder(shell)

    private inner class Adapter : RecyclerView.Adapter<Holder>() {
        init {
            setHasStableIds(true)
        }

        override fun getItemCount() = keys.size

        override fun getItemId(position: Int) = stableIds.getValue(keys[position])

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) = Holder(
            KuitoListShell(context, this@KuitoListView).apply {
                layoutParams = if (horizontal) RecyclerView.LayoutParams(WRAP, WRAP) else RecyclerView.LayoutParams(MATCH, WRAP)
            },
        )

        override fun onBindViewHolder(holder: Holder, position: Int) {
            holder.shell.host(cells.slot(keys[position]))
        }

        override fun onViewRecycled(holder: Holder) = holder.shell.release()

        override fun onFailedToRecycleView(holder: Holder): Boolean {
            holder.shell.release()

            return true
        }
    }

    private companion object {
        const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
        const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT
    }
}
