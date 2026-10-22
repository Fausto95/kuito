package dev.kuito.runtime.renderer.views

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.view.View
import android.view.animation.PathInterpolator

/** Where a page sits during a transition: shifted, faded, scaled about its center. */
internal data class KuitoPagePose(val x: Float = 0f, val alpha: Float = 1f, val scale: Float = 1f) {
    fun towards(end: KuitoPagePose, t: Float) =
        KuitoPagePose(x + (end.x - x) * t, alpha + (end.alpha - alpha) * t, scale + (end.scale - scale) * t)

    companion object {
        val REST = KuitoPagePose()
    }
}

internal var View.pose: KuitoPagePose
    get() = KuitoPagePose(translationX, alpha, scaleX)
    set(value) {
        translationX = value.x
        alpha = value.alpha
        scaleX = value.scale
        scaleY = value.scale
    }

/**
 * One transition at a time: pages move from wherever they are (a back preview
 * leaves them mid-way) to their end poses. [settle] jumps a running transition
 * to its end, so a new one always starts from a finished stack.
 */
internal class KuitoNavigationTransition {
    private var running: ValueAnimator? = null

    fun run(moves: List<Pair<View, KuitoPagePose>>, then: () -> Unit) {
        settle()

        val starts = moves.map { (page, _) -> page.pose }

        running = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = DURATION
            interpolator = STANDARD
            addUpdateListener { animator ->
                val t = animator.animatedValue as Float

                moves.forEachIndexed { index, (page, end) -> page.pose = starts[index].towards(end, t) }
            }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    if (running === animation) running = null

                    then()
                }
            })
            start()
        }
    }

    fun settle() {
        running?.end()
    }

    private companion object {
        // Material 3 standard duration and easing for moving between screens.
        const val DURATION = 300L
        val STANDARD = PathInterpolator(0.2f, 0f, 0f, 1f)
    }
}
