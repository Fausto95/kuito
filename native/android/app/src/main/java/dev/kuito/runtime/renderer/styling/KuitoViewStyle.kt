package dev.kuito.runtime.renderer.styling

import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.View
import dev.kuito.runtime.renderer.KuitoCost
import dev.kuito.runtime.renderer.KuitoHost
import dev.kuito.runtime.renderer.KuitoValue
import dev.kuito.runtime.renderer.accessibility.KuitoAccessibility
import dev.kuito.runtime.renderer.keyboard.KuitoKeyboardAvoider
import dev.kuito.runtime.renderer.layout.KuitoFlexLayout
import dev.kuito.runtime.renderer.layout.KuitoLayoutNode
import dev.kuito.runtime.renderer.properties.KuitoPropertySetter
import dev.kuito.runtime.renderer.views.KuitoSheetLayout
import kotlin.math.roundToInt

/** Why a removed view is still on screen. */
internal enum class KuitoExiting {
    /** Its `exit` runs on the UI thread, whose props it takes until `exited`. */
    Animated,

    /** Its container's transition owns it until it is off screen. */
    Transition,
}

/**
 * The renderer's one record of a view: its view, where its children's views
 * go, its sheet, whether it is leaving, its node in the layout engine, and
 * the style state of props that compose into one Android value or need
 * bookkeeping. [kind] makes the view when a flattened node needs one;
 * [props] are the kind's own, ahead of the shared tables: a module view's.
 */
internal class KuitoViewStyle(
    val kind: String,
    /** The app's id for the view, or the kernel's: what errors name it by. */
    val label: String,
    val layout: KuitoLayoutNode,
    val props: Map<String, KuitoPropertySetter>,
) {
    /** Null while the node is flattened (docs/flattening.md); its layout node positions it. */
    var view: View?
        get() = layout.view
        set(value) {
            layout.view = value
        }

    /** Where its children's views go when that is not the view: a ScrollView's content. */
    var content: KuitoFlexLayout? = null

    /** Set for a Sheet, which is presented in its own window rather than placed. */
    var sheet: KuitoSheetLayout? = null

    /** Set for a view that shows its children itself (KuitoHost). */
    var host: KuitoHost? = null

    /** Set once the view has left Kuito's tree but not the screen. */
    var exiting: KuitoExiting? = null

    /** Each prop's last value, which a write of the same value wastes (KuitoCost): debug builds only. */
    val written: HashMap<String, KuitoValue>? = if (KuitoCost.Counts.ENABLED) HashMap() else null

    /** Nodes of removed descendants that leave with this view, released when it has gone. */
    val followers = mutableListOf<KuitoLayoutNode>()

    /** Text's min-content width, which its layout node measures through. */
    val minContent = KuitoMinContent().also { layout.minContent = it }

    /** The view as errors name it: its kind, label and number. */
    fun described(id: Int) = "$kind $label ($id)"

    /** The view's parent in Kuito's tree (0: the root). Not always its layout node's parent: a sheet, a list row or a native container's child is a layout root of its own. */
    var parent = 0
    var translateX = 0f; var translateY = 0f
    var scale = 1f; var scaleX = 1f; var scaleY = 1f; var rotate = 0f
    var opacity = 1f

    /** Press feedback factors, multiplied into opacity and scale while pressed. */
    var pressedOpacity = 1f
    var pressedScale = 1f

    /** The alpha the view shows: its opacity, dimmed while pressed. */
    val effectiveOpacity get() = opacity * pressedOpacity
    var backgroundColor: Int? = null
    var gradientAngle = 180f
    var gradientColors: IntArray? = null
    var cornerRadius = 0f
    var borderWidth = 0
    /** Black until set, as a CALayer's border and React Native's are. */
    var borderColor = Color.BLACK
    /** True while the UI thread writes a prop: it applies at once, unanimated. */
    var driven = false
    /** The view waits for its exit on the UI thread before it goes, until `exited`. */
    var exit = false
    var exited = false
    var textTransform = "none"
    var text = ""
    // A text view's own colors, which unsetting the prop that replaced them
    // restores: each is kept when its prop is first set.
    var initialTextColors: ColorStateList? = null
    var initialHintTextColors: ColorStateList? = null
    var initialHighlightColor: Int? = null
    var fontFamily: String? = null
    var fontWeight = 400
    var italic = false
    /** The text's size in sp, once a prop set it or capped it; the theme's otherwise. */
    var fontSize: Float? = null
    /** The most the user's font scale enlarges `fontSize` by; no limit when null. */
    var maxFontScale: Float? = null
    val accessibility by lazy { KuitoAccessibility() }
    /** The view a navigation stack flies to its namesake on the next screen (KuitoSharedTransition). */
    var sharedId: String? = null
    var keyboardAvoider: KuitoKeyboardAvoider? = null
    /** The part of the view the system covers (top, right, bottom, left, dp), for SafeAreaView and a sheet's only view. */
    var safeAreaInset = FloatArray(4)
    /** The part of the view the keyboard covers, in dp, for keyboardAvoidance padding. */
    var keyboardInset = 0f
    /** How far keyboardAvoidance position lifts the view, in dp. */
    var keyboardOffset = 0f
    private var appliedInset = FloatArray(4)

    /** Padding the platform adds: the safe area, or the keyboard where it covers more. */
    fun applyInset(view: View) {
        val inset = safeAreaInset.copyOf().also { it[2] = maxOf(it[2], keyboardInset) }

        if (inset.contentEquals(appliedInset)) return

        appliedInset = inset
        layout.setInset(inset[0], inset[1], inset[2], inset[3])
        // The engine runs at Kuito's root; this marks every ancestor up to it.
        view.requestLayout()
    }

    /** Transform targets in pixels (translations already converted from dp). */
    fun transformTargets(density: Float): Map<AnimatedProperty, Float> {
        val s = scale * pressedScale
        return mapOf(
            AnimatedProperty.TranslationX to translateX * density,
            AnimatedProperty.TranslationY to (translateY - keyboardOffset) * density,
            AnimatedProperty.ScaleX to s * scaleX,
            AnimatedProperty.ScaleY to s * scaleY,
            AnimatedProperty.Rotation to rotate,
        )
    }

    /** One drawable for color or gradient, rounded corners and border. */
    fun background(density: Float) = GradientDrawable().apply {
        val colors = gradientColors
        if (colors != null && colors.size >= 2) {
            this.colors = colors
            orientation = orientationFor(gradientAngle)
        } else setColor(backgroundColor ?: Color.TRANSPARENT)
        // GradientDrawable clamps the radius to half the size, like CSS.
        cornerRadius = this@KuitoViewStyle.cornerRadius * density
        if (borderWidth > 0) setStroke(borderWidth, borderColor)
    }

    fun displayText() = when (textTransform) {
        "uppercase" -> text.uppercase()
        "lowercase" -> text.lowercase()
        "capitalize" -> text.split(" ").joinToString(" ") { word -> word.replaceFirstChar { it.uppercase() } }
        else -> text
    }

    companion object {
        /** GradientDrawable supports eight directions; CSS angles snap to the nearest 45°. */
        fun orientationFor(angle: Float): GradientDrawable.Orientation {
            val step = (((angle % 360) + 360) % 360 / 45f).roundToInt() % 8
            return listOf(
                GradientDrawable.Orientation.BOTTOM_TOP, GradientDrawable.Orientation.BL_TR,
                GradientDrawable.Orientation.LEFT_RIGHT, GradientDrawable.Orientation.TL_BR,
                GradientDrawable.Orientation.TOP_BOTTOM, GradientDrawable.Orientation.TR_BL,
                GradientDrawable.Orientation.RIGHT_LEFT, GradientDrawable.Orientation.BR_TL,
            )[step]
        }
    }
}
