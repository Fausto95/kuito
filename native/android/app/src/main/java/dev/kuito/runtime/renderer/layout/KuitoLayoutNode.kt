package dev.kuito.runtime.renderer.layout

import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.EditText
import android.widget.TextView
import androidx.annotation.Keep
import dev.kuito.runtime.renderer.KuitoCost
import dev.kuito.runtime.renderer.KuitoValue
import dev.kuito.runtime.renderer.styling.KuitoFrameAnimator
import dev.kuito.runtime.renderer.styling.KuitoMinContent
import dev.kuito.runtime.traced
import kotlin.math.roundToInt

/**
 * A node's box in dp, relative to its parent; children of a scroll view are
 * relative to its content. Ten values of [values] from [offset], in
 * KuitoLayoutJNI.cpp's order.
 */
internal class KuitoLayoutBox(val values: DoubleArray, val offset: Int) {
    val x get() = values[offset].toFloat()
    val y get() = values[offset + 1].toFloat()
    val width get() = values[offset + 2].toFloat()
    val height get() = values[offset + 3].toFloat()
    val contentWidth get() = values[offset + 4].toFloat()
    val contentHeight get() = values[offset + 5].toFloat()
    // A measured leaf's padding and border, which it draws its content inside.
    val paddingTop get() = values[offset + 6].toFloat()
    val paddingRight get() = values[offset + 7].toFloat()
    val paddingBottom get() = values[offset + 8].toFloat()
    val paddingLeft get() = values[offset + 9].toFloat()
}

/**
 * A view that keeps native state of its own: it is freed with the view's
 * node, once the view leaves Kuito's tree, whichever way it leaves.
 */
internal interface KuitoNativeState {
    fun releaseNative()
}

/**
 * A view's node in the shared flexbox engine (native/shared/layout), in dp.
 * Kinds the engine cannot see into (text, controls) are measured through
 * [view]. Call [release] once the view leaves Kuito's tree.
 */
internal class KuitoLayoutNode(kind: String) {
    private var handle = nativeCreate(kind)

    val measured = nativeMeasured(handle)

    /** The view this node positions, and measures when the kind is measured; null when flattened. */
    var view: View? = null
        set(value) {
            if (value !== field && measured) (value as? EditText)?.addTextChangedListener(typing)
            field = value
        }

    /** Its style's (KuitoViewStyle): null for a root, which is never measured. */
    var minContent: KuitoMinContent? = null

    /** Typing resizes an input without a prop change. */
    private val typing = object : TextWatcher {
        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        override fun afterTextChanged(s: Editable?) = markDirty()
    }

    /** How the view moves to a new frame (the `layout` prop); null applies it at once. */
    var frameAnimator: KuitoFrameAnimator? = null

    val parent: KuitoLayoutNode? get() = nativeParent(handle)
    val children: List<KuitoLayoutNode> get() = nativeChildren(handle).asList()

    fun insert(child: KuitoLayoutNode, index: Int) = nativeInsert(handle, child.handle, index)

    fun removeFromParent() = nativeRemoveFromParent(handle)

    /**
     * A node laid out on its own (a page, a sheet) inherits `direction` from
     * [host], the node of the view that shows it; null inherits nothing.
     */
    fun inheritFrom(host: KuitoLayoutNode?) = nativeInheritFrom(handle, host?.handle ?: 0L)

    /** Whether the node lays out right to left: its own `direction`, else the one it inherits. */
    val rightToLeft get() = nativeRightToLeft(handle)

    /**
     * Sets the prop at [key] (KuitoProps.byKey) from its typed value: a
     * number, a boolean as 0 or 1, an enum's index, or a length's text,
     * which the engine reads itself; anything else restores the kind's default.
     */
    fun set(key: Int, value: KuitoValue) = set(key, value, dirty = true)

    /** Sets a prop without marking the node dirty, for a prop that moves every frame: [relayout] follows. */
    fun change(key: Int, value: KuitoValue) = set(key, value, dirty = false)

    private fun set(key: Int, value: KuitoValue, dirty: Boolean) = when (value) {
        is KuitoValue.Number -> nativeSet(handle, key, NUMBER, value.value, 0, null, dirty)
        is KuitoValue.Bool -> nativeSet(handle, key, NUMBER, if (value.value) 1.0 else 0.0, 0, null, dirty)
        is KuitoValue.Text -> nativeSet(handle, key, TEXT, 0.0, 0, value.value, dirty)
        is KuitoValue.Enum -> nativeSet(handle, key, ENUM, 0.0, value.index, null, dirty)
        KuitoValue.Null, is KuitoValue.Color, is KuitoValue.Json, is KuitoValue.Keys, is KuitoValue.Struct ->
            nativeSet(handle, key, NULL, 0.0, 0, null, dirty)
    }

    /** Sets the node's own `direction`, as the prop does: the root's follows the app's first language. */
    fun setDirection(rightToLeft: Boolean) = nativeSetDirection(handle, rightToLeft)

    /**
     * After [change]: lays out again, at once, only the subtree of the
     * nearest ancestor whose own box the change cannot move, and returns its
     * nodes, that ancestor first, with their new boxes. Null when the change
     * can reach the root, which is left dirty for the next pass.
     */
    fun relayout(): Array<KuitoLayoutNode>? = nativeRelayout(handle)

    /** Padding the platform adds on top of the view's own, in dp (a safe-area inset). */
    fun setInset(top: Float, right: Float, bottom: Float, left: Float) = nativeSetInset(handle, top, right, bottom, left)

    /** What [measureLeaf] returns changed (text, font, a control's title): measure again in the next pass. */
    fun markDirty() {
        minContent?.forget()
        nativeMarkDirty(handle)
    }

    /** A measure change: the climb stops at the first fixed-size ancestor. */
    fun markContentDirty() {
        minContent?.forget()
        nativeMarkContentDirty(handle)
    }

    /** Whether the next pass lays this node out again. */
    val dirty get() = nativeDirty(handle)

    fun calculate(width: Float, height: Float, density: Float) {
        if (!KuitoCost.Counts.ENABLED) return nativeCalculate(handle, width, height, density)

        val before = frames?.copyOf()

        nativeCalculate(handle, width, height, density)
        KuitoCost.Counts.layoutPasses++
        if (before != null && before.contentEquals(frames)) KuitoCost.Counts.wastedLayoutPasses++
    }

    // Every box of the last pass that laid this node out, and where this
    // node's is: the engine sets both at the end of calculate(), only when
    // the tree's structure changed since.
    @Keep
    @JvmField
    var frames: DoubleArray? = null

    @Keep
    @JvmField
    var slot = 0

    private var laid = KuitoLayoutBox(UNLAID, 0)

    /** The box the last pass gave this node; zero before its first. Made again only when [frames] or [slot] moved. */
    fun box(): KuitoLayoutBox {
        val values = frames ?: return laid

        if (laid.values !== values || laid.offset != slot) laid = KuitoLayoutBox(values, slot)

        return laid
    }

    /** Fields the engine has set on nodes so far, every tree together: a pass over an unchanged structure sets none. */
    val fieldWrites get() = nativeFieldWrites()

    // A measure runs inside a pass, before it writes the frames.
    private val live = DoubleArray(FRAME_SIZE)

    private fun liveBox(): KuitoLayoutBox {
        nativeLayout(handle, live)

        return KuitoLayoutBox(live, 0)
    }

    fun release() {
        if (handle == 0L) return

        (view as? KuitoNativeState)?.releaseNative()

        nativeDestroy(handle)
        handle = 0L
    }

    /**
     * Called by the engine with the content-box space in dp; returns the
     * content size as two packed floats. The engine's padding is also the
     * view's (for drawing), so it is added to the measure spec and taken off
     * the result; a widget's own default padding stays part of its content.
     */
    @Keep
    private fun measureLeaf(width: Float, widthMode: Int, height: Float, heightMode: Int): Long = traced("Kuito measureLeaf") {
        val view = view ?: return 0L

        (view as? KuitoModeMeasured)?.let { leaf ->
            val (measuredWidth, measuredHeight) = leaf.measure(width, widthMode, height, heightMode)

            return pack(measuredWidth, measuredHeight)
        }

        val density = view.resources.displayMetrics.density
        val box = liveBox()

        applyPadding(box)

        val paddingX = view.paddingLeft + view.paddingRight
        val paddingY = view.paddingTop + view.paddingBottom
        // Controls have no narrower form.
        val minWidth = if (widthMode == MIN_CONTENT) (view as? TextView)?.let { minContent?.width(it) } else null

        // Content's height follows from its width: available height is not
        // a limit (a TextView would clip its measured height to it).
        view.measure(
            minWidth?.let { View.MeasureSpec.makeMeasureSpec(it + paddingX, View.MeasureSpec.AT_MOST) }
                ?: spec(width, widthMode, paddingX, density),
            spec(height, if (heightMode == EXACTLY) EXACTLY else UNDEFINED, paddingY, density),
        )

        val measuredWidth = (view.measuredWidth - paddingX).coerceAtLeast(0) / density
        val measuredHeight = (view.measuredHeight - paddingY).coerceAtLeast(0) / density

        pack(measuredWidth, measuredHeight)
    }

    private fun pack(width: Float, height: Float) =
        (width.toRawBits().toLong() shl 32) or (height.toRawBits().toLong() and 0xffffffffL)

    /** A measured leaf draws inside the engine's padding and border. */
    fun applyPadding(box: KuitoLayoutBox = box()) {
        val view = view ?: return
        val density = view.resources.displayMetrics.density
        val px = { dp: Float -> (dp * density).roundToInt() }
        val left = px(box.paddingLeft)
        val top = px(box.paddingTop)
        val right = px(box.paddingRight)
        val bottom = px(box.paddingBottom)

        if (view.paddingLeft != left || view.paddingTop != top || view.paddingRight != right || view.paddingBottom != bottom)
            view.setPadding(left, top, right, bottom)
    }

    private fun spec(size: Float, mode: Int, padding: Int, density: Float): Int {
        val pixels = (size * density).roundToInt() + padding

        return when (mode) {
            EXACTLY -> View.MeasureSpec.makeMeasureSpec(pixels, View.MeasureSpec.EXACTLY)
            AT_MOST -> View.MeasureSpec.makeMeasureSpec(pixels, View.MeasureSpec.AT_MOST)
            else -> View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
        }
    }

    private external fun nativeCreate(kind: String): Long
    private external fun nativeDestroy(handle: Long)
    private external fun nativeMeasured(handle: Long): Boolean
    private external fun nativeInsert(parent: Long, child: Long, index: Int)
    private external fun nativeRemoveFromParent(handle: Long)
    private external fun nativeInheritFrom(handle: Long, host: Long)
    private external fun nativeRightToLeft(handle: Long): Boolean
    private external fun nativeSet(handle: Long, key: Int, kind: Int, number: Double, index: Int, text: String?, dirty: Boolean)
    private external fun nativeSetDirection(handle: Long, rightToLeft: Boolean)
    private external fun nativeRelayout(handle: Long): Array<KuitoLayoutNode>?
    private external fun nativeSetInset(handle: Long, top: Float, right: Float, bottom: Float, left: Float)
    private external fun nativeMarkDirty(handle: Long)
    private external fun nativeMarkContentDirty(handle: Long)
    private external fun nativeDirty(handle: Long): Boolean
    private external fun nativeCalculate(handle: Long, width: Float, height: Float, scale: Float)
    private external fun nativeLayout(handle: Long, out: DoubleArray)
    private external fun nativeFieldWrites(): Long
    private external fun nativeParent(handle: Long): KuitoLayoutNode?
    private external fun nativeChildren(handle: Long): Array<KuitoLayoutNode>

    companion object {
        /** The engine's counts since launch: nodes laid out, measure calls, wasted measures. */
        fun cost(): LongArray = nativeCost()

        @JvmStatic
        private external fun nativeCost(): LongArray

        private const val FRAME_SIZE = 10
        private val UNLAID = DoubleArray(FRAME_SIZE)
        private const val EXACTLY = KuitoMeasureMode.EXACTLY
        private const val AT_MOST = KuitoMeasureMode.AT_MOST
        private const val UNDEFINED = KuitoMeasureMode.UNDEFINED
        private const val MIN_CONTENT = KuitoMeasureMode.MIN_CONTENT

        // LayoutValue::Kind (native/shared/layout/KuitoLayoutStyle.h).
        private const val NULL = 0
        private const val NUMBER = 1
        private const val TEXT = 2
        private const val ENUM = 3

        init {
            System.loadLibrary("kuito_mobile")
        }
    }
}
