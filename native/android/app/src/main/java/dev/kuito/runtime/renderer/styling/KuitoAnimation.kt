package dev.kuito.runtime.renderer.styling

import android.view.View
import dev.kuito.runtime.renderer.KuitoLayoutAnimationValue
import dev.kuito.runtime.renderer.KuitoRenderError

/** A `layout` animation's spec (milliseconds): timing with a cubic-bezier, or a spring. */
sealed class KuitoAnimationSpec {
    abstract val delay: Long

    data class Timing(val duration: Long, val curve: FloatArray, override val delay: Long) : KuitoAnimationSpec()
    data class Spring(val damping: Float, val stiffness: Float, val mass: Float, override val delay: Long) : KuitoAnimationSpec()

    companion object {
        internal fun of(spec: KuitoLayoutAnimationValue): KuitoAnimationSpec = when (spec) {
            is KuitoLayoutAnimationValue.Timing -> {
                val easing = spec.value.easing

                if (easing.size != 4) throw KuitoRenderError.Rejection("expects a cubic-bezier easing of 4 numbers")

                Timing(spec.value.duration.toLong(), FloatArray(4) { easing[it].toFloat() }, spec.value.delay.toLong())
            }
            is KuitoLayoutAnimationValue.Spring -> Spring(
                spec.value.damping.toFloat(), spec.value.stiffness.toFloat(), spec.value.mass.toFloat(), spec.value.delay.toLong(),
            )
        }
    }
}

/** A view property the transform and opacity props compose into. */
enum class AnimatedProperty {
    Alpha, TranslationX, TranslationY, ScaleX, ScaleY, Rotation;

    fun set(view: View, value: Float) = when (this) {
        Alpha -> view.alpha = value
        TranslationX -> view.translationX = value
        TranslationY -> view.translationY = value
        ScaleX -> view.scaleX = value
        ScaleY -> view.scaleY = value
        Rotation -> view.rotation = value
    }
}

/** Set `targets` at once, stopping a press feedback animation of the same view. */
fun View.applyTargets(targets: Map<AnimatedProperty, Float>) {
    animate().cancel()
    targets.forEach { (property, value) -> property.set(this, value) }
}
