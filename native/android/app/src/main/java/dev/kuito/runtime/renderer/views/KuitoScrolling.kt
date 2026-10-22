package dev.kuito.runtime.renderer.views

import android.annotation.SuppressLint
import android.content.Context
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ScrollView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import android.view.MotionEvent
import android.view.animation.AnimationUtils
import dev.kuito.runtime.renderer.KuitoRenderError
import android.widget.OverScroller
import kotlin.math.roundToInt
import dev.kuito.runtime.renderer.keyboard.KuitoScrollKeyboard
import dev.kuito.runtime.renderer.layout.KuitoFlexLayout
import dev.kuito.runtime.renderer.KuitoEventPayload
import dev.kuito.runtime.renderer.KuitoScrollPayload
import dev.kuito.runtime.renderer.KuitoScrollRequestValue

/** What scroll props set on a ScrollView or a List. */
internal interface KuitoScrollable : KuitoMotionSource {
    var emitsScroll: Boolean
    /** Sends the view's `motion` events while on (docs/motion.md#motion-sources). */
    val motion: KuitoScrollMotion
    override var sendsMotion: Boolean
        get() = motion.on
        set(value) {
            motion.on = value
        }
    var scrollEventThrottle: Long
    var endReachedThreshold: Float
    var refreshable: Boolean
    /** Shows the pull-to-refresh spinner. */
    var refreshShown: Boolean
    /** Keyboard insets, dismissal and tap handling, fed every touch on the scrolling view. */
    val keyboard: KuitoScrollKeyboard
    /** The view that scrolls. */
    val scroller: ViewGroup
    /** Only content that scrolls vertically can scroll out from under the keyboard. */
    val vertical: Boolean
    fun showIndicator(vertical: Boolean, shown: Boolean)
    /** Insets the content's bottom on screen by the part the keyboard covers, on top of the view's own padding. */
    fun insetKeyboard(px: Int)
    /** Scrolls the content up on screen by `px`. */
    fun lift(px: Int)
    /** A scroll request: `{ offset, animated }`, `{ end, animated }` or a ScrollView's `{ page, animated }`, and a list's `{ key, ... }`. */
    fun scroll(request: KuitoScrollRequestValue)
    /** No request: one still waiting is dropped. */
    fun cancelScroll()
}

/**
 * A ScrollView of either axis: its children live in a content view, which
 * owns the padding. It clips what scrolls past its edges and corners, as a
 * UIScrollView does, to its own outline: Kuito's parents clip no children,
 * and a hardware render node clips a child to its bounds only when its
 * parent clips, so the content would draw past the view.
 */
internal interface KuitoScrolling : KuitoScrollable {
    /** Holds the scroll view's children, sized to the content by the layout engine. */
    val content: KuitoFlexLayout
    val settler: ScrollSettler
    /** Sends `scrollend` where the view comes to rest. */
    val rest: ScrollRest
    val snap: KuitoScrollSnap get() = settler.snap
    override val vertical: Boolean get() = scroller is ScrollView

    override fun scroll(request: KuitoScrollRequestValue) = settler.request(request)

    override fun cancelScroll() = settler.cancel()

    override fun insetKeyboard(px: Int) {
        scroller.clipToPadding = false
        scroller.setPadding(scroller.paddingLeft, scroller.paddingTop, scroller.paddingRight, px)
    }

    override fun lift(px: Int) = scroller.scrollBy(0, px)
}

/**
 * Throttled scroll events (in dp) and end-reached, shared by both axes. End
 * fires once per content length; growing content re-arms it, and content
 * shorter than the view counts as reaching the end, as in React Native.
 */
internal class ScrollReporter(
    private val density: Float,
    private val horizontal: Boolean,
    private val emit: (String, KuitoEventPayload?) -> Unit,
) {
    var emitsScroll = false
    var throttle = 50L
    var threshold = 0.5f
    private var lastEvent = 0L
    private var endReachedLength = -1

    fun scrolled(scroll: View, content: View) {
        endCheck(scroll, content)

        if (!emitsScroll) return

        val now = SystemClock.uptimeMillis()

        if (now - lastEvent < throttle) return

        lastEvent = now
        emit("scroll", KuitoScrollPayload(
            x = (scroll.scrollX / density).toDouble(), y = (scroll.scrollY / density).toDouble(),
            contentWidth = (content.width / density).toDouble(), contentHeight = (content.height / density).toDouble(),
            layoutWidth = (scroll.width / density).toDouble(), layoutHeight = (scroll.height / density).toDouble(),
        ))
    }

    fun endCheck(scroll: View, content: View) {
        val visible = if (horizontal) scroll.width else scroll.height
        val length = if (horizontal) content.width else content.height
        val offset = if (horizontal) scroll.scrollX else scroll.scrollY

        if (visible <= 0 || length <= 0 || length == endReachedLength) return

        if (length - (offset + visible) > threshold * visible) return

        endReachedLength = length
        emit("reachend", null)
    }
}

/**
 * HTML's `scrollend` for a scroll view of either axis. Android's scroll
 * views say when they move, never when they stop: a display frame that
 * finds the view still for [REST_AFTER], with no finger on it, sends where
 * it rests, once per rest. A fling, a settling page and a request all end
 * that way. Sent whether or not the app listens, as it comes once per rest.
 */
internal class ScrollRest(
    private val scroll: View,
    private val content: () -> View,
    private val emit: (String, KuitoEventPayload?) -> Unit,
) {
    /** Display time in seconds; tests set their own. */
    var clock: () -> Double = { AnimationUtils.currentAnimationTimeMillis() / 1000.0 }

    private val density = scroll.resources.displayMetrics.density
    private var moving = false
    private var touching = false
    private var lastMove = 0.0
    private var ticking = false
    private val tick = Runnable {
        ticking = false
        frame()
    }

    /** The view scrolled: from its scroll listener. */
    fun scrolled() {
        moving = true
        lastMove = clock()
        nextFrame()
    }

    /** Every touch on the view: a finger on it holds it, however still. */
    fun touched(event: MotionEvent) {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> touching = true
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                touching = false
                lastMove = clock()
                nextFrame()
            }
        }
    }

    /** A display frame while it moves: one that finds it still and let go brings it to rest. */
    fun frame() {
        if (!moving || touching) return
        if (clock() - lastMove < REST_AFTER) return nextFrame()

        moving = false

        val content = content()

        emit("scrollend", KuitoScrollPayload(
            x = (scroll.scrollX / density).toDouble(), y = (scroll.scrollY / density).toDouble(),
            contentWidth = (content.width / density).toDouble(), contentHeight = (content.height / density).toDouble(),
            layoutWidth = (scroll.width / density).toDouble(), layoutHeight = (scroll.height / density).toDouble(),
        ))
    }

    private fun nextFrame() {
        if (ticking || !moving) return

        ticking = true
        scroll.postOnAnimation(tick)
    }

    private companion object {
        /** As KuitoScrollMotion's: still for two frames at 60 Hz. */
        const val REST_AFTER = 1.0 / 30
    }
}

/**
 * Scroll requests and where a drag rests, for a scroll view of either axis.
 * A request waits for the scroll view's next layout, so the end includes
 * what the same batch added. A fling or a drag that ends settles at the
 * paging or snap offset the rule picks (KuitoScrollSnap).
 */
internal class ScrollSettler(private val scroll: FrameLayout, private val horizontal: Boolean) {
    val snap = KuitoScrollSnap()
    private val density = scroll.resources.displayMetrics.density
    private val projector = OverScroller(scroll.context)
    private var pending: KuitoScrollRequestValue? = null
    private var flung = false

    private val offset get() = if (horizontal) scroll.scrollX else scroll.scrollY

    /** The visible length, inside the padding the keyboard inset adds. */
    private val page get() =
        if (horizontal) scroll.width - scroll.paddingLeft - scroll.paddingRight
        else scroll.height - scroll.paddingTop - scroll.paddingBottom

    /** As ScrollView's own scroll range. */
    private val maximum: Int get() {
        val content = scroll.getChildAt(0) ?: return 0

        return ((if (horizontal) content.width else content.height) - page).coerceAtLeast(0)
    }

    fun request(request: KuitoScrollRequestValue) {
        if (request is KuitoScrollRequestValue.Key)
            throw KuitoRenderError.Rejection("a ScrollView scrolls to an offset or its end; a key is a List's")

        pending = request
        scroll.requestLayout()
    }

    fun cancel() {
        pending = null
    }

    /** After the scroll view laid its content out. */
    fun laidOut() {
        val request = pending ?: return

        pending = null

        val (target, animated) = when (request) {
            is KuitoScrollRequestValue.Offset ->
                (request.value.offset.toFloat() * density).roundToInt().coerceIn(0, maximum) to request.value.animated
            is KuitoScrollRequestValue.End -> (if (request.value.end) maximum else 0) to request.value.animated
            // A whole view length each, as paging rests.
            is KuitoScrollRequestValue.Page -> (request.value.page * page).coerceIn(0, maximum) to request.value.animated
            // request() refuses a key: only a List has keys.
            is KuitoScrollRequestValue.Key -> return
        }

        move(target, animated = animated ?: true)
    }

    /** Takes a fling that snaps, or returns false to let the view fling freely. */
    fun fling(velocity: Int): Boolean {
        projector.fling(0, offset, 0, velocity, 0, 0, 0, maximum)

        val target = snap.rest(offset, projector.finalY, velocity, page, maximum) ?: return false

        projector.abortAnimation()
        flung = true
        move(target, animated = true)

        return true
    }

    /**
     * Every touch on the scroll view, after it handled it, including those a
     * child takes first. A touch that ends without a fling settles too: a
     * slow drag, or a tap that stopped a settling scroll midway.
     */
    fun touched(event: MotionEvent) {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> flung = false
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                if (flung) return

                snap.rest(offset, offset, 0, page, maximum)?.takeIf { it != offset }?.let { move(it, animated = true) }
            }
        }
    }

    private fun move(target: Int, animated: Boolean) {
        val (x, y) = if (horizontal) target to scroll.scrollY else scroll.scrollX to target

        when (scroll) {
            is ScrollView -> if (animated) scroll.smoothScrollTo(x, y) else scroll.scrollTo(x, y)
            is HorizontalScrollView -> if (animated) scroll.smoothScrollTo(x, y) else scroll.scrollTo(x, y)
        }
    }
}

private fun content(context: Context) = KuitoFlexLayout(context).apply { scrollContent = true }

/** Its bounds until a decoration gives it a background, whose rounded outline then clips it. */
private fun View.clipsToOutline() {
    outlineProvider = ViewOutlineProvider.BOUNDS
    clipToOutline = true
}

/** A vertical ScrollView inside a SwipeRefreshLayout, enabled only when refreshable. */
@SuppressLint("ViewConstructor")
internal class KuitoVerticalScroll(
    context: Context,
    private val emit: (String, KuitoEventPayload?) -> Unit,
) : SwipeRefreshLayout(context), KuitoScrolling {
    override val keyboard = KuitoScrollKeyboard()
    private val scroll: ScrollView = object : ScrollView(context) {
        override fun onInterceptTouchEvent(event: MotionEvent) =
            keyboard.intercepts(this, event) || super.onInterceptTouchEvent(event)

        override fun dispatchTouchEvent(event: MotionEvent): Boolean {
            keyboard.observe(this, event)

            return super.dispatchTouchEvent(event).also {
                settler.touched(event)
                rest.touched(event)
            }
        }

        override fun fling(velocityY: Int) {
            if (!settler.fling(velocityY)) super.fling(velocityY)
        }

        override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
            super.onLayout(changed, l, t, r, b)
            settler.laidOut()
        }
    }
    override val settler: ScrollSettler = ScrollSettler(scroll, horizontal = false)
    override val rest = ScrollRest(scroll, { content }, emit)
    override val scroller: ViewGroup get() = scroll
    override val motion = KuitoScrollMotion(scroll, { scroll.scrollY }, emit)
    private val reporter = ScrollReporter(context.resources.displayMetrics.density, horizontal = false, emit)
    override val content = content(context)

    override var emitsScroll by reporter::emitsScroll
    override var scrollEventThrottle by reporter::throttle
    override var endReachedThreshold by reporter::threshold

    override var refreshable = false
        set(value) {
            field = value
            isEnabled = value
        }

    override var refreshShown: Boolean
        get() = isRefreshing
        set(value) {
            isRefreshing = value
        }

    init {
        clipsToOutline()
        isEnabled = false
        scroll.addView(content)
        addView(scroll, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setOnRefreshListener { emit("refresh", null) }
        scroll.setOnScrollChangeListener { _, _, _, _, _ ->
            reporter.scrolled(scroll, content)
            motion.scrolled()
            rest.scrolled()
        }
        scroll.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> reporter.endCheck(scroll, content) }
    }

    override fun showIndicator(vertical: Boolean, shown: Boolean) {
        if (vertical) scroll.isVerticalScrollBarEnabled = shown
    }
}

/** A HorizontalScrollView; pull-to-refresh is vertical only, as in React Native. */
@SuppressLint("ViewConstructor")
internal class KuitoHorizontalScroll(
    context: Context,
    emit: (String, KuitoEventPayload?) -> Unit,
) : HorizontalScrollView(context), KuitoScrolling {
    private val reporter = ScrollReporter(context.resources.displayMetrics.density, horizontal = true, emit)
    override val content = content(context)
    override val keyboard = KuitoScrollKeyboard()
    override val settler: ScrollSettler = ScrollSettler(this, horizontal = true)
    override val rest = ScrollRest(this, { content }, emit)
    override val scroller: ViewGroup get() = this
    override val motion = KuitoScrollMotion(this, { scrollX }, emit)

    override var emitsScroll by reporter::emitsScroll
    override var scrollEventThrottle by reporter::throttle
    override var endReachedThreshold by reporter::threshold
    override var refreshable = false
    override var refreshShown = false

    init {
        clipsToOutline()
        addView(content)
        setOnScrollChangeListener { _, _, _, _, _ ->
            reporter.scrolled(this, content)
            motion.scrolled()
            rest.scrolled()
        }
        addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> reporter.endCheck(this, content) }
    }

    override fun showIndicator(vertical: Boolean, shown: Boolean) {
        if (!vertical) isHorizontalScrollBarEnabled = shown
    }

    override fun onInterceptTouchEvent(event: MotionEvent) =
        keyboard.intercepts(this, event) || super.onInterceptTouchEvent(event)

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        keyboard.observe(this, event)

        return super.dispatchTouchEvent(event).also {
            settler.touched(event)
            rest.touched(event)
        }
    }

    override fun fling(velocityX: Int) {
        if (!settler.fling(velocityX)) super.fling(velocityX)
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        super.onLayout(changed, l, t, r, b)
        settler.laidOut()
    }
}
