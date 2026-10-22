package dev.kuito.runtime.renderer.layout

import android.content.Context
import android.os.LocaleList
import android.text.TextUtils
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import dev.kuito.runtime.renderer.KuitoAblation
import dev.kuito.runtime.renderer.KuitoCost
import dev.kuito.runtime.renderer.KuitoFrameLedger
import dev.kuito.runtime.renderer.gestures.GestureHandlerRootHelper
import dev.kuito.runtime.traced
import kotlin.math.roundToInt

/**
 * A Kuito container (Stack, Row, Box, Pressable, a scroll view's content):
 * sizes and places its children from the layout engine. The engine works in
 * dp and rounds edges to pixels, so converting edges never leaves gaps.
 */
internal open class KuitoFlexLayout(context: Context) : ViewGroup(context) {
    var node: KuitoLayoutNode? = null

    /**
     * Runs gesture recognition ahead of the views' own touch handling, on a
     * root of touches: the screen's root, or a sheet's content in its own
     * window (docs/motion.md).
     */
    var gestures: GestureHandlerRootHelper? = null

    /** A scroll view's content: as large as the node's content, not its frame. */
    var scrollContent = false

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val box = node?.box() ?: return setMeasuredDimension(0, 0)

        setMeasuredDimension(
            px(if (scrollContent) box.contentWidth else box.width),
            px(if (scrollContent) box.contentHeight else box.height),
        )
        measureChildren()
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        val started = if (KuitoCost.Counts.ENABLED) KuitoFrameLedger.now() else 0.0
        val framed = KuitoCost.Counts.nodesFramed
        val wasted = KuitoCost.Counts.wastedFrames
        // Layout elided (KuitoAblation): a view that has a frame keeps it.
        val keepFrames = KuitoCost.Counts.ENABLED && KuitoAblation.elides(KuitoAblation.LAYOUT)

        forEachChildView { child, view, box, dx, dy ->
            if (keepFrames && view.width > 0) return@forEachChildView view.layout(view.left, view.top, view.right, view.bottom)

            val x = px(dx + box.x)
            val y = px(dy + box.y)

            if (child.measured) child.applyPadding(box)

            val right = x + px(box.width)
            val bottom = y + px(box.height)

            if (KuitoCost.Counts.ENABLED) {
                KuitoCost.Counts.nodesFramed++
                if (view.left == x && view.top == y && view.right == right && view.bottom == bottom) KuitoCost.Counts.wastedFrames++
            }

            child.frameAnimator?.layout(view, x, y, right, bottom) ?: view.layout(x, y, right, bottom)
        }

        if (KuitoCost.Counts.ENABLED)
            KuitoFrameLedger.recordFrames(started, (KuitoCost.Counts.nodesFramed - framed).toInt(), (KuitoCost.Counts.wastedFrames - wasted).toInt())
    }

    /**
     * Measures and places its views again at its own size, from boxes a
     * relayout wrote, without a pass from the window down.
     */
    fun layOutAgain() {
        forceLayout()
        measure(MeasureSpec.makeMeasureSpec(measuredWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(measuredHeight, MeasureSpec.EXACTLY))
        layout(left, top, right, bottom)
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean =
        gestures?.dispatchTouchEvent(event) { super.dispatchTouchEvent(it) } ?: super.dispatchTouchEvent(event)

    override fun requestDisallowInterceptTouchEvent(disallowIntercept: Boolean) {
        if (disallowIntercept) gestures?.requestDisallowInterceptTouchEvent()
        super.requestDisallowInterceptTouchEvent(disallowIntercept)
    }

    /** Children are measured to exactly the size the engine gave them. */
    protected fun measureChildren() {
        forEachChildView { _, view, box, _, _ -> view.measure(exactly(box.width), exactly(box.height)) }
    }

    /**
     * Each child view with its box and the offset of its flattened ancestors:
     * a flattened child has no view, so its children sit in this group,
     * shifted by its position.
     */
    private fun forEachChildView(action: (KuitoLayoutNode, View, KuitoLayoutBox, Float, Float) -> Unit) {
        fun visit(parent: KuitoLayoutNode, dx: Float, dy: Float) {
            for (child in parent.children) {
                val box = child.box()
                val view = child.view

                if (view == null) visit(child, dx + box.x, dy + box.y)
                else if (laidOut(view)) action(child, view, box, dx, dy)
            }
        }

        node?.let { visit(it, 0f, 0f) }
    }

    /**
     * A hidden view keeps its last size, as Android's own groups leave GONE
     * children alone: the engine gives it zeros, and resizing a whole hidden
     * screen to nothing and back re-lays out every text in it.
     */
    private fun laidOut(view: View) = view.visibility != View.GONE

    private fun exactly(size: Float) = View.MeasureSpec.makeMeasureSpec(px(size), View.MeasureSpec.EXACTLY)

    private fun px(dp: Float) = (dp * resources.displayMetrics.density).roundToInt()
}

/**
 * Holds Kuito's root views and runs the layout engine for the whole tree on
 * every measure pass. Root views stack in a column that fills this view; a
 * root ScrollView takes the full height. The root lays out in the direction
 * of the user's first language, which every view without a `direction` of
 * its own inherits.
 */
internal class KuitoRootLayout(context: Context) : KuitoFlexLayout(context) {
    // The root behaves like a Stack: a column that stretches its children.
    val root = KuitoLayoutNode("VStack").also { it.view = this }
    private var rightToLeft: Boolean? = null

    init {
        node = root
        followFirstLanguage()
    }

    /** The direction localization.locales reports for the first language. */
    fun followFirstLanguage() {
        val rtl = TextUtils.getLayoutDirectionFromLocale(LocaleList.getDefault()[0]) == View.LAYOUT_DIRECTION_RTL

        if (rtl == rightToLeft) return

        rightToLeft = rtl
        root.setDirection(rtl)
        layOutEveryView()
    }

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val width = MeasureSpec.getSize(widthSpec)
        val height = MeasureSpec.getSize(heightSpec)
        val density = resources.displayMetrics.density

        traced("Kuito layout") { root.calculate(width / density, height / density, density) }
        setMeasuredDimension(width, height)
        measureChildren()
    }

}

/**
 * After [KuitoLayoutNode.change]: lays out at once only the subtree whose
 * boxes the change can move, and places its views there (docs/motion.md).
 * Otherwise [fallback], the changed view or the one it sits in, asks the
 * window for a pass.
 */
internal fun KuitoLayoutNode.relayOut(fallback: View) {
    val laidOut = relayout() ?: return fallback.requestLayout()
    var host: KuitoLayoutNode? = laidOut.first()

    while (host != null && host.view == null) host = host.parent

    // A layout root (the screen, a page, a sheet, a row) calculates its tree
    // whenever it measures: it takes the window's pass.
    val group = host?.view as? KuitoFlexLayout

    if (group == null || host?.parent == null) return fallback.requestLayout()

    // A view measures and places its children only when forced or resized:
    // every view from a shown one up to the group is forced, the views
    // between nodes included (a scroll view's content), so the group's pass
    // reaches each and clears every flag it sets.
    for (node in laidOut) node.view?.let { view -> forceUpTo(view, group) }
    group.layOutAgain()
}

/**
 * Forces [view] and its ancestors below [group]: not when one is GONE, which
 * the group's pass skips, nor when the view is not in the group.
 */
private fun forceUpTo(view: View, group: View) {
    if (view === group) return

    val chain = generateSequence(view) { (it.parent as? View)?.takeIf { parent -> parent !== group } }.toList()

    if (chain.last().parent === group && chain.none { it.visibility == View.GONE }) chain.forEach(View::forceLayout)
}

/**
 * Lays this view and every view in it out again: a page takes a new
 * direction through its host's node, but lays out only when its own view
 * measures. For changes as rare as a direction's.
 */
internal fun View.layOutEveryView() {
    forceLayout()
    (this as? ViewGroup)?.let { group -> for (index in 0 until group.childCount) group.getChildAt(index).layOutEveryView() }
    requestLayout()
}
