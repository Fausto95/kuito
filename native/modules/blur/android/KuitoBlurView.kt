package dev.kuito.runtime.modules.blur

import android.content.Context
import android.content.res.Configuration
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.Shader
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import androidx.annotation.RequiresApi
import dev.kuito.runtime.modules.KuitoType
import dev.kuito.runtime.modules.KuitoViewDefinition
import dev.kuito.runtime.modules.KuitoViewEvents
import dev.kuito.runtime.renderer.layout.KuitoFlexLayout

/**
 * `Blur` in native/modules/blur/blur.ts: a container laid out by the engine
 * as a Box, which draws what is behind it, blurred and tinted by its
 * material, under its children. Android blurs a view's own drawing, never
 * what is behind it, so the view records its backdrop itself: before each
 * frame it draws the views behind it into a RenderNode that a RenderEffect
 * blurs (Android 12). Before Android 12 it draws the tint alone, made
 * opaque enough to read on. Its props are defined here, beside the view,
 * as on iOS.
 */
internal class KuitoBlurView(context: Context, @Suppress("UNUSED_PARAMETER") events: KuitoViewEvents) :
    KuitoFlexLayout(context) {

    /** How a material draws: a blur radius in dp and a tint over it. */
    data class Look(val radius: Float, val tint: Int)

    private var material = Material.REGULAR
        set(next) { field = next; invalidate() }

    private val backdrop = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Backdrop(this) else null

    init {
        setWillNotDraw(false)
    }

    /** The material's look in the given scheme; by default the one the view shows. */
    fun look(night: Boolean = night()): Look = material.look(night, blurs = backdrop != null)

    /**
     * Draws the views behind this one into [canvas], in this view's
     * coordinates: each ancestor's children that come before the branch
     * holding this view, and none above it or in it.
     */
    fun drawBackdrop(canvas: Canvas) {
        val origin = positionOf(this)
        var child: View = this
        var parent = child.parent as? ViewGroup
        val levels = mutableListOf<Pair<ViewGroup, Int>>()

        while (parent != null) {
            levels += parent to parent.indexOfChild(child)
            child = parent
            parent = child.parent as? ViewGroup
        }

        for ((group, before) in levels.asReversed()) {
            val at = positionOf(group)

            canvas.save()
            canvas.translate(at.first - origin.first, at.second - origin.second)
            group.background?.draw(canvas)
            canvas.translate(-group.scrollX.toFloat(), -group.scrollY.toFloat())
            for (index in 0 until before) drawChild(canvas, group.getChildAt(index))
            canvas.restore()
        }
    }

    /**
     * Where [view]'s origin is in its topmost ancestor, scrolls and
     * translations included; scales and rotations of the ancestors are left
     * out. Unlike getLocationInWindow, it holds before the view is attached.
     */
    private fun positionOf(view: View): Pair<Float, Float> {
        var x = 0f
        var y = 0f
        var current: View = view

        while (true) {
            val parent = current.parent as? View ?: return x to y

            x += current.left + current.translationX - parent.scrollX
            y += current.top + current.translationY - parent.scrollY
            current = parent
        }
    }

    private fun drawChild(canvas: Canvas, view: View) {
        if (view.visibility != View.VISIBLE || view.alpha == 0f) return

        val saved = canvas.save()

        canvas.translate(view.left.toFloat(), view.top.toFloat())
        canvas.concat(view.matrix)
        if (view.alpha < 1f) canvas.saveLayerAlpha(0f, 0f, view.width.toFloat(), view.height.toFloat(), (view.alpha * 255).toInt())
        view.draw(canvas)
        canvas.restoreToCount(saved)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        backdrop?.attach()
    }

    override fun onDetachedFromWindow() {
        backdrop?.detach()
        super.onDetachedFromWindow()
    }

    override fun onConfigurationChanged(configuration: Configuration) {
        super.onConfigurationChanged(configuration)
        invalidate()
    }

    override fun dispatchDraw(canvas: Canvas) {
        val look = look()

        if (backdrop != null && canvas.isHardwareAccelerated) backdrop.draw(canvas, look.radius * resources.displayMetrics.density)
        canvas.drawColor(look.tint)
        super.dispatchDraw(canvas)
    }

    private fun night() = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES

    /**
     * The blurred backdrop, recorded before each frame the window draws.
     * Recording the views behind refreshes the node the view's own drawing
     * refers to, so the view needs no invalidate: one would draw another
     * frame, and so on forever.
     */
    @RequiresApi(Build.VERSION_CODES.S)
    private class Backdrop(private val view: KuitoBlurView) {
        private val node = RenderNode("KuitoBlur")
        private var radius = -1f
        private val record = ViewTreeObserver.OnPreDrawListener {
            record()
            true
        }

        fun attach() = view.viewTreeObserver.addOnPreDrawListener(record)

        fun detach() = view.viewTreeObserver.removeOnPreDrawListener(record)

        fun draw(canvas: Canvas, radius: Float) {
            if (radius != this.radius) {
                this.radius = radius
                node.setRenderEffect(if (radius > 0) RenderEffect.createBlurEffect(radius, radius, Shader.TileMode.CLAMP) else null)
            }
            canvas.drawRenderNode(node)
        }

        private fun record() {
            if (view.width == 0 || view.height == 0) return

            node.setPosition(0, 0, view.width, view.height)

            val canvas = node.beginRecording(view.width, view.height)

            try {
                view.drawBackdrop(canvas)
            } finally {
                node.endRecording()
            }
        }
    }

    /**
     * Apple's system materials as Android draws them: a blur radius and a
     * tint per scheme, picked by eye against iOS 26 on an iPhone. Without a
     * blur the tint is what keeps text above legible, so it is near opaque.
     * Compare both platforms on a device before tuning one.
     */
    enum class Material(private val radius: Float, private val light: Int, private val dark: Int) {
        ULTRA_THIN(12f, Color.argb(77, 255, 255, 255), Color.argb(77, 28, 28, 30)),
        THIN(18f, Color.argb(128, 255, 255, 255), Color.argb(128, 28, 28, 30)),
        REGULAR(24f, Color.argb(166, 250, 250, 250), Color.argb(166, 28, 28, 30)),
        THICK(30f, Color.argb(204, 245, 245, 245), Color.argb(204, 24, 24, 26)),
        CHROME(24f, Color.argb(191, 248, 248, 248), Color.argb(191, 36, 36, 38));

        fun look(night: Boolean, blurs: Boolean): Look {
            val tint = if (night) dark else light

            return Look(radius, if (blurs) tint else Color.argb(235, Color.red(tint), Color.green(tint), Color.blue(tint)))
        }
    }

    companion object {
        fun define(view: KuitoViewDefinition<KuitoBlurView>) {
            view.prop("material", KuitoType.optional(KuitoType.enum(Material.entries.toTypedArray()))) { blur, value ->
                blur.material = value ?: Material.REGULAR
            }
        }
    }
}
