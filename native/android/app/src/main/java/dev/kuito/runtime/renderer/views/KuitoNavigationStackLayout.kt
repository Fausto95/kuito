package dev.kuito.runtime.renderer.views

import android.content.Context
import android.graphics.Canvas
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import androidx.activity.BackEventCompat
import androidx.activity.OnBackPressedCallback
import androidx.activity.findViewTreeOnBackPressedDispatcherOwner
import dev.kuito.runtime.renderer.KuitoEventPayload
import dev.kuito.runtime.renderer.KuitoHost
import dev.kuito.runtime.renderer.KuitoRenderError
import dev.kuito.runtime.renderer.KuitoStyled
import dev.kuito.runtime.renderer.KuitoTreeLinks
import dev.kuito.runtime.renderer.layout.KuitoLayoutNode
import dev.kuito.runtime.renderer.styling.KuitoViewStyle

/**
 * NavigationStack: shows the top of its NavigationScreen children, each on a
 * page with its header. Kernel changes apply at the next measure, once the
 * whole batch is in (a screen inserted mid-stack arrives as an append, then a
 * move): one screen more on top pushes, one fewer pops, and anything else sets
 * the stack without animation. Back pops while this stack is visible and has
 * a screen to go back to; on API 34 the back gesture previews the pop.
 */
internal class KuitoNavigationStackLayout(
    context: Context,
    emit: (String, KuitoEventPayload?) -> Unit,
) : ViewGroup(context), KuitoHost, KuitoStyled, KuitoMotionSource {
    /** How far a back swipe has taken the top screen away (docs/motion.md#motion-sources). */
    val motion = KuitoBackMotion(emit)
    override var sendsMotion by motion::on

    /** The kernel's screens, bottom to top, less any the platform popped before the kernel heard. */
    private val screens = mutableListOf<KuitoNavigationScreenLayout>()

    /** What the stack shows, bottom to top. */
    private var shown = emptyList<KuitoNavigationScreenLayout>()

    private var changed = false
    private var previewing = false
    private val transition = KuitoNavigationTransition()
    private val shared = KuitoSharedTransition(this)

    /** The shared views inside a screen, by sharedId: the renderer answers. */
    var sharedElements: (View) -> Map<String, View> = { emptyMap() }

    /** The stack's node, whose direction mirrors the pushes and the pops. */
    private var node: KuitoLayoutNode? = null
    private val density get() = resources.displayMetrics.density

    private val back = object : OnBackPressedCallback(false) {
        override fun handleOnBackStarted(backEvent: BackEventCompat) = previewStarted()

        override fun handleOnBackProgressed(backEvent: BackEventCompat) = previewed(backEvent.progress, backEvent.swipeEdge)

        override fun handleOnBackCancelled() = previewCancelled()

        override fun handleOnBackPressed() = popByUser()
    }

    // Visibility comes from ancestors too (a tab switch hides a whole stack),
    // and any change to it ends in a layout pass.
    private val layoutListener = ViewTreeObserver.OnGlobalLayoutListener(::updateBack)

    override fun style(style: KuitoViewStyle, tree: KuitoTreeLinks) {
        sharedElements = tree.sharedElements
        node = style.layout
    }

    override fun adopt(child: View, label: String, index: Int?) = place(child, index)

    override fun move(child: View, index: Int) = place(child, index)

    /** Puts [child] at [index] (null: on top); adds it if new. */
    private fun place(child: View, index: Int?) {
        val screen = child as? KuitoNavigationScreenLayout ?: throw KuitoRenderError.InvalidTree("only a NavigationScreen goes in a NavigationStack")

        if (!screens.remove(screen)) screen.header.setNavigationOnClickListener { popByUser() }

        screens.add((index ?: screens.size).coerceIn(0, screens.size), screen)
        changed()
    }

    override fun release(child: View, gone: () -> Unit) {
        val screen = child as? KuitoNavigationScreenLayout ?: throw KuitoRenderError.InvalidTree("only a NavigationScreen goes in a NavigationStack")
        val removed = screens.remove(screen)

        // A screen never shown, or one the platform popped whose page has
        // already left, is done; otherwise its page leaves at the next sync.
        if (screen in shown || screen.parent?.parent === this) screen.gone = gone else gone()

        if (removed) changed()
    }

    // Visible or not: a hidden stack syncs when it is next measured, shown, and may animate then.
    override fun animatesRemoval(child: View) = shown.size > 1 && child === shown.last()

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()

        val owner = findViewTreeOnBackPressedDispatcherOwner()
            ?: error("A NavigationStack needs an activity with an OnBackPressedDispatcher")

        // The dispatcher asks the newest callback first, and a nested stack
        // attaches after the stack around it, so the innermost visible one wins.
        owner.onBackPressedDispatcher.addCallback(back)
        viewTreeObserver.addOnGlobalLayoutListener(layoutListener)
        updateBack()
    }

    override fun onDetachedFromWindow() {
        back.remove()
        viewTreeObserver.removeOnGlobalLayoutListener(layoutListener)
        transition.settle()
        // A detached stack measures no more: screens the kernel removed are off screen now.
        shown.filterNot(screens::contains).forEach { screen ->
            screen.gone?.invoke()
            screen.gone = null
        }
        super.onDetachedFromWindow()
    }

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val width = MeasureSpec.getSize(widthSpec)
        val height = MeasureSpec.getSize(heightSpec)

        setMeasuredDimension(width, height)

        if (changed) sync(width)

        for (index in 0 until childCount) {
            val page = getChildAt(index)

            if (page.visibility != View.GONE) page.measure(exactly(width), exactly(height))
        }
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        for (index in 0 until childCount) {
            val page = getChildAt(index)

            if (page.visibility != View.GONE) page.layout(0, 0, right - left, bottom - top)
        }
    }

    // Transitions move pages past the stack's edges; they never draw outside
    // it, whatever the stack's `overflow`.
    override fun dispatchDraw(canvas: Canvas) {
        val saved = canvas.save()

        canvas.clipRect(0, 0, width, height)
        super.dispatchDraw(canvas)
        canvas.restoreToCount(saved)
    }

    private fun changed() {
        changed = true
        requestLayout()
    }

    /** Shows [screens], during a measure pass. */
    private fun sync(width: Int) {
        changed = false

        val previous = shown
        val next = screens.toList()

        if (next == previous) return

        transition.settle()
        shared.settle()
        shown = next

        val animated = isShown && width > 0
        // A screen comes in from the side lines end at, and leaves by it.
        val slide = width * SLIDE * if (node?.rightToLeft == true) -1 else 1
        val incoming = next.lastOrNull()
        val outgoing = previous.lastOrNull()

        when {
            animated && incoming != null && outgoing != null &&
                next.size == previous.size + 1 && next.subList(0, previous.size) == previous -> push(outgoing, incoming, slide)
            animated && incoming != null && outgoing != null &&
                previous.size == next.size + 1 && previous.subList(0, next.size) == next -> pop(outgoing, incoming, slide)
            else -> jump(previous)
        }

        next.forEachIndexed { index, screen -> screen.canGoBack = index > 0 }
        updateBack()
    }

    private fun push(outgoing: KuitoNavigationScreenLayout, incoming: KuitoNavigationScreenLayout, slide: Float) {
        endPreview()
        arrange()
        outgoing.page.visibility = View.VISIBLE
        incoming.page.pose = KuitoPagePose(x = slide, alpha = 0f)
        shared.run(outgoing.page, incoming.page, sharedElements)
        transition.run(listOf(incoming.page to KuitoPagePose.REST, outgoing.page to KuitoPagePose(x = -slide))) {
            outgoing.page.pose = KuitoPagePose.REST

            if (outgoing !== shown.lastOrNull()) outgoing.page.visibility = View.GONE
        }
    }

    /** The outgoing page stays above the incoming one until it has gone; a back preview's poses carry on. */
    private fun pop(outgoing: KuitoNavigationScreenLayout, incoming: KuitoNavigationScreenLayout, slide: Float) {
        val previewed = previewing && incoming.page.visibility == View.VISIBLE

        previewing = false
        arrange()

        if (!previewed) incoming.page.pose = KuitoPagePose(x = -slide)

        // A back preview already moved the pages with the gesture; they settle without a flight.
        if (!previewed) shared.run(outgoing.page, incoming.page, sharedElements)

        transition.run(
            listOf(
                outgoing.page to KuitoPagePose(x = slide, alpha = 0f, scale = outgoing.page.scaleX),
                incoming.page to KuitoPagePose.REST,
            ),
        ) {
            drop(outgoing, inLayout = false)
            motion.moved(0f)
        }
    }

    private fun jump(previous: List<KuitoNavigationScreenLayout>) {
        endPreview()
        previous.filterNot(shown::contains).forEach { drop(it, inLayout = true) }
        arrange()
    }

    /** Pages of [shown] in order at the bottom; the top one visible, the rest kept but hidden. */
    private fun arrange() {
        shown.forEachIndexed { index, screen ->
            val page = screen.page

            if (getChildAt(index) === page) return@forEachIndexed

            if (page.parent === this) removeViewInLayout(page)

            addViewInLayout(page, index, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT), true)
        }

        shown.forEach { screen -> screen.page.visibility = if (screen === shown.last()) View.VISIBLE else View.GONE }
        invalidate()
    }

    private fun drop(screen: KuitoNavigationScreenLayout, inLayout: Boolean) {
        val page = screen.page

        if (page.parent === this) if (inLayout) removeViewInLayout(page) else removeView(page)

        page.pose = KuitoPagePose.REST
        screen.gone?.invoke()
        screen.gone = null
    }

    private fun popByUser() {
        val top = shown.lastOrNull() ?: return

        // Twice before the next sync is still one pop.
        if (shown.size < 2 || top !in screens) return

        // A swipe let go past its commit point: the top screen is gone.
        if (previewing) motion.moved(1f)

        screens.remove(top)
        changed()
        top.dismissed()
    }

    private fun previewStarted() {
        transition.settle()

        if (changed || shown.size < 2) return

        val below = shown[shown.size - 2].page

        below.pose = KuitoPagePose.REST
        below.visibility = View.VISIBLE
        previewing = true
    }

    /** The top page shrinks and leans away from the edge the gesture started at, over the screen below. */
    private fun previewed(progress: Float, edge: Int) {
        if (!previewing) return

        motion.moved(progress)

        val direction = if (edge == BackEventCompat.EDGE_LEFT) 1f else -1f

        shown.last().page.pose = KuitoPagePose(
            x = direction * progress * PREVIEW_SHIFT * density,
            scale = 1f - PREVIEW_SCALE * progress,
        )
    }

    private fun previewCancelled() {
        if (!previewing) return

        previewing = false
        motion.moved(0f)

        val below = shown[shown.size - 2]

        transition.run(listOf(shown.last().page to KuitoPagePose.REST)) {
            if (below !== shown.lastOrNull()) below.page.visibility = View.GONE
        }
    }

    /** A change the preview did not lead to: pages go back to rest before it applies. */
    private fun endPreview() {
        if (!previewing) return

        previewing = false
        pages().forEach { it.pose = KuitoPagePose.REST }
    }

    private fun pages() = (0 until childCount).map(::getChildAt)

    private fun updateBack() {
        back.isEnabled = isAttachedToWindow && isShown && shown.size > 1
    }

    private fun exactly(size: Int) = MeasureSpec.makeMeasureSpec(size, MeasureSpec.EXACTLY)

    private companion object {
        /** How far, as a fraction of the stack's width, a page slides as it comes in or goes. */
        const val SLIDE = 0.25f

        // Material's predictive back for in-app screens: the top screen
        // shrinks to 90% and shifts a few dp as the gesture goes.
        const val PREVIEW_SCALE = 0.1f
        const val PREVIEW_SHIFT = 24f
    }
}
