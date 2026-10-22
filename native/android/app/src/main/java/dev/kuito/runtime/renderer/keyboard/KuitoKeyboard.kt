package dev.kuito.runtime.renderer.keyboard

import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
import dev.kuito.runtime.renderer.KuitoEventEmitter
import dev.kuito.runtime.renderer.KuitoKeyboardFramePayload
import dev.kuito.runtime.renderer.views.KuitoScrollable
import java.util.Collections
import java.util.WeakHashMap

/**
 * Tracks the software keyboard through WindowInsetsAnimation: reports its
 * events to JavaScript as the app's `keyboard.<type>` (Will events included,
 * as on iOS) and moves avoiding views on every frame of the keyboard's own
 * animation, with no JavaScript on the way.
 */
internal class KuitoKeyboard(private val root: ViewGroup, private val events: KuitoEventEmitter) {
    /** Containers with keyboardAvoidance; each is owned by its view's style. */
    val avoiders: MutableSet<KuitoKeyboardAvoider> = Collections.newSetFromMap(WeakHashMap())

    /** The keyboard's height in px, as it is drawn this frame. */
    private var height = 0
    /** keyboard.height's moves, once the app asks for them. */
    val motion = KuitoKeyboardMotion(root, { height }, events)
    private var animating = false
    private val density get() = root.resources.displayMetrics.density

    init {
        // Clearing an input's focus would hand it to the first other input;
        // the root takes it instead. It is no screen reader element itself.
        root.isFocusableInTouchMode = true
        root.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        root.viewTreeObserver.addOnGlobalLayoutListener(::laidOut)
        // Focus moving between inputs while the keyboard stays up.
        root.viewTreeObserver.addOnGlobalFocusChangeListener { _, focused -> if (height > 0 && focused is EditText) avoid() }

        ViewCompat.setWindowInsetsAnimationCallback(root, object : WindowInsetsAnimationCompat.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
            // Before the insets listener sees the end state, so it leaves this change to the animation.
            override fun onPrepare(animation: WindowInsetsAnimationCompat) {
                if (animation.isIme()) animating = true
            }

            override fun onStart(
                animation: WindowInsetsAnimationCompat,
                bounds: WindowInsetsAnimationCompat.BoundsCompat,
            ): WindowInsetsAnimationCompat.BoundsCompat {
                if (animation.isIme()) report("will", target(), animation.durationMillis)

                return bounds
            }

            override fun onProgress(insets: WindowInsetsCompat, running: List<WindowInsetsAnimationCompat>): WindowInsetsCompat {
                if (running.any { it.isIme() }) move(insets.getInsets(WindowInsetsCompat.Type.ime()).bottom)

                return insets
            }

            override fun onEnd(animation: WindowInsetsAnimationCompat) {
                if (!animation.isIme()) return

                animating = false
                move(target())
                report("did", height, animation.durationMillis)
            }
        })

        // A change without an animation (a floating keyboard, an older Android).
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom

            if (!animating && ime != height) {
                report("will", ime, 0)
                move(ime)
                report("did", ime, 0)
            }

            insets
        }
    }

    /** Re-applies avoidance now: a new avoider, a changed prop, or focus moving between inputs. */
    fun avoid() = move(height)

    private fun move(ime: Int) {
        height = ime
        motion.moved()
        apply(reveal = true)
        // The engine runs at the root, in this frame's traversal.
        root.requestLayout()
    }

    /**
     * After any layout while the keyboard shows: content that moved may need a
     * new lift. The next pass settles it; a view's own lift never changes what
     * it measures. Only keyboard and focus changes reveal the focused input,
     * so a later layout never undoes the user's scrolling.
     */
    private fun laidOut() {
        if (height > 0 && !animating) apply(reveal = false)
    }

    private fun apply(reveal: Boolean) {
        val top = if (height > 0) root.rootView.height - height else Int.MAX_VALUE
        val focused = root.findFocus() as? EditText

        avoiders.toList().forEach { it.apply(top, focused) }
        scrollViews(root).forEach { it.keyboard.avoid(it, top, focused, reveal) }
    }

    private fun report(phase: String, ime: Int, duration: Long) {
        val window = root.rootView
        val shown = ime > 0
        val payload = KuitoKeyboardFramePayload(
            screenX = 0.0, screenY = ((window.height - ime) / density).toDouble(),
            width = (window.width / density).toDouble(), height = (ime / density).toDouble(),
            duration = duration.toDouble(), easing = "keyboard",
        )

        events.emit(0, "keyboard." + phase + if (shown) "show" else "hide", payload)
        events.emit(0, "keyboard." + phase + "changeframe", payload)
    }

    private fun target() = ViewCompat.getRootWindowInsets(root)?.getInsets(WindowInsetsCompat.Type.ime())?.bottom ?: 0

    private fun WindowInsetsAnimationCompat.isIme() = typeMask and WindowInsetsCompat.Type.ime() != 0

    private fun scrollViews(view: View): List<KuitoScrollable> {
        val group = view as? ViewGroup ?: return emptyList()

        return (0 until group.childCount).flatMap { index ->
            val child = group.getChildAt(index)

            listOfNotNull(child as? KuitoScrollable) + scrollViews(child)
        }
    }

    companion object {

        /** How much room an input keeps above the keyboard, in dp. */
        const val CLEARANCE = 8f
    }
}
