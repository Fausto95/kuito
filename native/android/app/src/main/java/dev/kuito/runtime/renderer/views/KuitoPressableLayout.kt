package dev.kuito.runtime.renderer.views

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.TouchDelegate
import android.view.View
import dev.kuito.runtime.renderer.KuitoStyled
import dev.kuito.runtime.renderer.KuitoTreeLinks
import dev.kuito.runtime.renderer.KuitoTouchPayload
import dev.kuito.runtime.renderer.layout.KuitoFlexLayout
import dev.kuito.runtime.renderer.styling.AnimatedProperty
import dev.kuito.runtime.renderer.styling.KuitoViewStyle

/**
 * React Native's Pressable: a column that reports press-in, press-out,
 * press and long press, with feedback applied natively on touch-down. A press
 * ends in onPress only when no long press fired, as in React Native.
 */
@SuppressLint("ViewConstructor")
internal class KuitoPressableLayout(
    context: Context,
    /** Emits a press phase with the touch location, in dp. */
    private val emit: (String, KuitoTouchPayload) -> Unit,
) : KuitoFlexLayout(context), KuitoStyled {
    /** The view's style, which composes pressed feedback with its own opacity and transform. */
    var style: KuitoViewStyle? = null

    override fun style(style: KuitoViewStyle, tree: KuitoTreeLinks) {
        this.style = style
    }

    var activeOpacity = 1f
    var pressedScale = 1f
    var longPressDuration = 500L
    var haptic: String? = null
    var disabled = false

    /** Extra touchable margin, in px; applied through the parent's TouchDelegate. */
    var hitSlop = 0
        set(value) {
            field = value
            post(::installHitSlop)
        }

    private val density = context.resources.displayMetrics.density
    private val handler = Handler(Looper.getMainLooper())
    private var pressing = false
    private var longPressed = false
    private var longPress: Runnable? = null

    init {
        isClickable = true
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (disabled) return true

        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> begin(event)
            MotionEvent.ACTION_MOVE -> if (pressing && !retains(event)) finish(event, pressed = false)
            MotionEvent.ACTION_UP -> if (pressing) finish(event, pressed = !longPressed)
            MotionEvent.ACTION_CANCEL -> if (pressing) finish(event, pressed = false)
        }

        return true
    }

    private fun begin(event: MotionEvent) {
        pressing = true
        longPressed = false
        showPressed(true)
        playHaptic()
        emit("pressin", location(event))

        val location = location(event)

        longPress = Runnable {
            if (!pressing) return@Runnable

            longPressed = true
            emit("longpress", location)
        }.also { handler.postDelayed(it, longPressDuration) }
    }

    private fun finish(event: MotionEvent, pressed: Boolean) {
        val location = location(event)

        pressing = false
        longPress?.let(handler::removeCallbacks)
        longPress = null
        showPressed(false)
        emit("pressout", location)

        if (pressed) emit("press", location)
    }

    /** A touch may leave the view (plus hitSlop) by the retention distance before the press cancels. */
    private fun retains(event: MotionEvent): Boolean {
        val slop = hitSlop + (PRESS_RETENTION_DP * density).toInt()

        return event.x >= -slop && event.y >= -slop && event.x <= width + slop && event.y <= height + slop
    }

    private fun location(event: MotionEvent) = KuitoTouchPayload(
        locationX = (event.x / density).toDouble(),
        locationY = (event.y / density).toDouble(),
        pageX = (event.rawX / density).toDouble(),
        pageY = (event.rawY / density).toDouble(),
    )

    /** Quick in, gentle out, from the current state so fast taps never jump. */
    private fun showPressed(pressed: Boolean) {
        val style = style ?: return

        if (activeOpacity == 1f && pressedScale == 1f) return

        style.pressedOpacity = if (pressed) activeOpacity else 1f
        style.pressedScale = if (pressed) pressedScale else 1f

        val targets = style.transformTargets(density)

        animate()
            .alpha(style.effectiveOpacity)
            .scaleX(targets.getValue(AnimatedProperty.ScaleX))
            .scaleY(targets.getValue(AnimatedProperty.ScaleY))
            .setDuration(if (pressed) 80 else 200)
            .start()
    }

    private fun playHaptic() {
        val feedback = when (haptic) {
            "selection" -> HapticFeedbackConstants.CLOCK_TICK
            "light" -> HapticFeedbackConstants.VIRTUAL_KEY
            "medium", "heavy" -> HapticFeedbackConstants.LONG_PRESS
            else -> return
        }

        performHapticFeedback(feedback)
    }

    /** Android can only extend a touch area through the parent; a parent has one delegate. */
    private fun installHitSlop() {
        val parent = parent as? View ?: return
        val area = Rect()

        getHitRect(area)
        area.inset(-hitSlop, -hitSlop)
        parent.touchDelegate = if (hitSlop > 0) TouchDelegate(area, this) else null
    }

    override fun onDetachedFromWindow() {
        longPress?.let(handler::removeCallbacks)
        super.onDetachedFromWindow()
    }

    private companion object {
        const val PRESS_RETENTION_DP = 20f
    }
}
