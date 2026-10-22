package dev.kuito.runtime.modules.slider

import android.content.Context
import android.content.res.ColorStateList
import android.widget.SeekBar
import dev.kuito.runtime.modules.KuitoType
import dev.kuito.runtime.modules.KuitoViewDefinition
import dev.kuito.runtime.modules.KuitoViewEvents
import kotlin.math.roundToInt

/**
 * `Slider` in native/modules/slider/slider.ts: a SeekBar over `minimum`…`maximum`.
 * Its integer progress counts steps, or thousandths when it slides freely. Its
 * props are defined here, beside the view, as on iOS.
 */
class KuitoSliderView(context: Context, private val events: KuitoViewEvents) : SeekBar(context) {
    /**
     * The value chosen last, by the app or by the user's move, applied again
     * when the bounds or the step change. The kernel sends no value the user
     * chose, as the view already shows it, so the move must record it here.
     */
    private var chosen = 0.0
    var value
        get() = chosen
        set(next) { chosen = next; sync() }
    var minimum = 0.0
        set(next) { field = next; sync() }
    var maximum = 1.0
        set(next) { field = next; sync() }
    var step = 0.0
        set(next) { field = next; sync() }

    private val steps get() = if (step > 0) ((maximum - minimum) / step).roundToInt().coerceAtLeast(1) else FREE_STEPS

    init {
        setOnSeekBarChangeListener(object : OnSeekBarChangeListener {
            override fun onProgressChanged(bar: SeekBar, progress: Int, fromUser: Boolean) {
                if (!fromUser) return

                chosen = valueAt(progress)
                events.emit("change", mapOf("value" to chosen))
            }

            override fun onStartTrackingTouch(bar: SeekBar) {}

            override fun onStopTrackingTouch(bar: SeekBar) {
                events.emit("changeEnd", mapOf("value" to valueAt(progress)))
            }
        })
        sync()
    }

    private fun valueAt(progress: Int) = minimum + (maximum - minimum) * progress / steps

    private fun sync() {
        val span = maximum - minimum

        max = steps
        progress = if (span <= 0) 0 else ((chosen.coerceIn(minimum, maximum) - minimum) / span * steps).roundToInt()
    }

    companion object {
        private const val FREE_STEPS = 1000

        fun define(view: KuitoViewDefinition<KuitoSliderView>) {
            val number = KuitoType.optional(KuitoType.double)
            val color = KuitoType.optional(KuitoType.color)

            view.prop("value", number) { slider, value -> slider.value = value ?: 0.0 }
            view.prop("min", number) { slider, value -> slider.minimum = value ?: 0.0 }
            view.prop("max", number) { slider, value -> slider.maximum = value ?: 1.0 }
            view.prop("step", number) { slider, value -> slider.step = maxOf(value ?: 0.0, 0.0) }
            view.prop("disabled", KuitoType.optional(KuitoType.boolean)) { slider, value -> slider.isEnabled = value != true }
            view.prop("fillColor", color) { slider, value ->
                slider.progressTintList = value?.let { ColorStateList.valueOf(it) }
                slider.thumbTintList = slider.progressTintList
            }
            view.prop("trackColor", color) { slider, value ->
                slider.progressBackgroundTintList = value?.let { ColorStateList.valueOf(it) }
            }
        }
    }
}
