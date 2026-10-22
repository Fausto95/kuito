package dev.kuito.runtime.renderer.styling

import android.animation.ValueAnimator
import android.view.View
import android.view.animation.PathInterpolator
import androidx.dynamicanimation.animation.FloatValueHolder
import androidx.dynamicanimation.animation.SpringAnimation
import androidx.dynamicanimation.animation.SpringForce
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * The `layout` prop: a view moves to each new frame the layout gives it with
 * `spec`, from where it shows now, as LayoutTransition's CHANGING animates
 * bounds. A view's first frame, and every frame with animations off, applies
 * at once.
 */
internal class KuitoFrameAnimator(private val spec: KuitoAnimationSpec) {
    private var target: IntArray? = null
    private var cancel: (() -> Unit)? = null

    fun layout(view: View, left: Int, top: Int, right: Int, bottom: Int) {
        val next = intArrayOf(left, top, right, bottom)

        if (next.contentEquals(target)) return

        target = next
        cancel?.invoke()
        cancel = null

        val from = intArrayOf(view.left, view.top, view.right, view.bottom)
        val first = view.width == 0 && view.height == 0

        if (first || from.contentEquals(next) || !ValueAnimator.areAnimatorsEnabled())
            return view.layout(left, top, right, bottom)

        val step = { progress: Float ->
            val at = IntArray(4) { from[it] + ((next[it] - from[it]) * progress).roundToInt() }

            view.layout(at[0], at[1], at[2], at[3])
        }

        cancel = when (spec) {
            is KuitoAnimationSpec.Timing -> timing(spec, step)
            is KuitoAnimationSpec.Spring -> spring(view, spec, step)
        }
    }

    private fun timing(spec: KuitoAnimationSpec.Timing, step: (Float) -> Unit): () -> Unit {
        val animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = spec.duration
            startDelay = spec.delay
            interpolator = PathInterpolator(spec.curve[0], spec.curve[1], spec.curve[2], spec.curve[3])
            addUpdateListener { step(it.animatedValue as Float) }
        }

        animator.start()

        return { animator.cancel() }
    }

    private fun spring(view: View, spec: KuitoAnimationSpec.Spring, step: (Float) -> Unit): () -> Unit {
        // SpringForce has no mass: fold it into the stiffness and the damping ratio.
        val force = SpringForce(1f).apply {
            stiffness = spec.stiffness / spec.mass
            dampingRatio = spec.damping / (2 * sqrt(spec.stiffness * spec.mass))
        }
        val spring = SpringAnimation(FloatValueHolder(0f)).setSpring(force).apply {
            setStartValue(0f)
            addUpdateListener { _, value, _ -> step(value) }
        }
        val start = Runnable { spring.start() }

        view.postDelayed(start, spec.delay)

        return {
            view.removeCallbacks(start)
            spring.cancel()
        }
    }
}
