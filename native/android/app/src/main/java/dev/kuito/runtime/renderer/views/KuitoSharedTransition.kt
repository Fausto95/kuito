package dev.kuito.runtime.renderer.views

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Rect
import android.graphics.drawable.BitmapDrawable
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.animation.PathInterpolator

/**
 * Shared elements (docs/navigation.md#shared-elements): a view on the page a
 * stack leaves flies to the view with the same sharedId on the page it shows.
 * A bitmap of the leaving view moves over [host], in its overlay, from that
 * view's resting frame to the arriving view's once the arriving page has laid
 * out; both views hide while it flies and show as they were when it lands.
 * It moves with the pages, on the same duration and easing.
 */
internal class KuitoSharedTransition(private val host: ViewGroup) {
    private var running: ValueAnimator? = null

    fun run(from: View, to: View, sharedElements: (View) -> Map<String, View>) {
        settle()

        val sources = sharedElements(from).filterValues { it.width > 0 && it.height > 0 }

        if (sources.isEmpty()) return

        // Taken now: the leaving page is laid out; the arriving one is not yet.
        val snapshots = sources.mapValues { (_, view) -> snapshot(view) to resting(view, from) }

        to.viewTreeObserver.addOnPreDrawListener(object : ViewTreeObserver.OnPreDrawListener {
            override fun onPreDraw(): Boolean {
                to.viewTreeObserver.removeOnPreDrawListener(this)
                fly(snapshots, sources, sharedElements(to), to)

                return true
            }
        })
    }

    private fun fly(
        snapshots: Map<String, Pair<BitmapDrawable, Rect>>,
        sources: Map<String, View>,
        targets: Map<String, View>,
        to: View,
    ) {
        val flights = snapshots.mapNotNull { (sharedId, taken) ->
            val target = targets[sharedId] ?: return@mapNotNull null
            val source = sources.getValue(sharedId)

            Flight(taken.first, taken.second, resting(target, to), listOf(source to source.alpha, target to target.alpha))
        }

        if (flights.isEmpty()) return

        flights.forEach { flight ->
            flight.hidden.forEach { (view, _) -> view.alpha = 0f }
            flight.drawable.bounds = flight.start
            host.overlay.add(flight.drawable)
        }

        running = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = DURATION
            interpolator = STANDARD
            addUpdateListener { animator ->
                val t = animator.animatedValue as Float

                flights.forEach { it.drawable.bounds = it.at(t) }
            }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    if (running === animation) running = null

                    flights.forEach { flight ->
                        host.overlay.remove(flight.drawable)
                        flight.hidden.forEach { (view, alpha) -> view.alpha = alpha }
                    }
                }
            })
            start()
        }
    }

    /** Ends a running flight where it lands. */
    fun settle() {
        running?.end()
    }

    private fun snapshot(view: View): BitmapDrawable {
        val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)

        view.draw(Canvas(bitmap))

        return BitmapDrawable(view.resources, bitmap)
    }

    /** [view]'s frame in [host] with its page at rest: pages fill the stack when no transition moves them. */
    private fun resting(view: View, page: View): Rect {
        val inView = IntArray(2).also(view::getLocationInWindow)
        val inPage = IntArray(2).also(page::getLocationInWindow)
        // Relative to its page, whatever offset the page's transition gives it.
        val left = inView[0] - inPage[0]
        val top = inView[1] - inPage[1]

        return Rect(left, top, left + view.width, top + view.height)
    }

    private class Flight(val drawable: BitmapDrawable, val start: Rect, val end: Rect, val hidden: List<Pair<View, Float>>) {
        fun at(t: Float) = Rect(
            lerp(start.left, end.left, t),
            lerp(start.top, end.top, t),
            lerp(start.right, end.right, t),
            lerp(start.bottom, end.bottom, t),
        )

        private fun lerp(from: Int, to: Int, t: Float) = (from + (to - from) * t).toInt()
    }

    private companion object {
        // The pages' own duration and easing (KuitoNavigationTransition).
        const val DURATION = 300L
        val STANDARD = PathInterpolator(0.2f, 0f, 0f, 1f)
    }
}
