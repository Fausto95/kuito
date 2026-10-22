package dev.kuito.runtime.renderer.views

import android.annotation.SuppressLint
import android.app.Dialog
import android.content.Context
import android.graphics.Color
import android.graphics.Outline
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.widget.FrameLayout
import androidx.activity.setViewTreeOnBackPressedDispatcherOwner
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.bottomsheet.BottomSheetDragHandleView
import dev.kuito.runtime.R
import dev.kuito.runtime.renderer.KuitoStyled
import dev.kuito.runtime.renderer.KuitoTreeLinks
import dev.kuito.runtime.renderer.KuitoEventPayload
import dev.kuito.runtime.renderer.KuitoIndexPayload
import dev.kuito.runtime.renderer.KuitoSnapPointValue
import dev.kuito.runtime.renderer.gestures.GestureHandlerRootHelper
import dev.kuito.runtime.renderer.layout.KuitoFlexLayout
import dev.kuito.runtime.renderer.layout.KuitoLayoutNode
import dev.kuito.runtime.renderer.styling.KuitoViewStyle
import kotlin.math.roundToInt

/** A sheet height: dp, a fraction of the screen, or the content's own height. */
internal sealed class SnapPoint {
    data class Points(val dp: Float) : SnapPoint()
    data class Fraction(val value: Float) : SnapPoint()
    data object Content : SnapPoint()

    companion object {
        /** The `snapPoints` prop's points, none being the content's height; null when one is neither a height, a percentage nor `content`. */
        fun list(values: List<KuitoSnapPointValue>): List<SnapPoint>? {
            val points = values.map { point ->
                when (point) {
                    is KuitoSnapPointValue.Height -> Points(point.value.toFloat())
                    is KuitoSnapPointValue.Named -> when (val name = point.value) {
                        "content" -> Content
                        else -> name.removeSuffix("%").toFloatOrNull()?.takeIf { name.endsWith("%") }?.let { Fraction(it / 100) }
                            ?: return null
                    }
                }
            }

            return points.ifEmpty { listOf(Content) }
        }
    }
}

/** How a Sheet is presented: Material's bottom sheet, or a full-screen dialog for a modal or full-screen route. */
internal enum class SheetPresentation(val value: String) {
    Sheet("sheet"),
    Modal("modal"),
    FullScreen("fullScreen"),
    ;

    companion object {
        fun of(value: String) = entries.firstOrNull { it.value == value }
    }
}

/**
 * BottomSheet: its children's root, presented in Material's BottomSheetDialog
 * while `open`. The view is the sheet's content, so style props apply inside
 * it, and it lays out its own subtree with the shared engine at the sheet's
 * width, clear of the navigation bar and display cutout. A modal or
 * full-screen presentation fills a dialog of its own (KuitoModalDialog).
 */
@SuppressLint("ViewConstructor")
internal class KuitoSheetLayout(
    context: Context,
    private val emit: (String, KuitoEventPayload?) -> Unit,
) : KuitoFlexLayout(context), KuitoStyled, KuitoMotionSource {
    companion object {
        /** Material 3's bottom sheet corner radius, in dp. */
        const val CORNER_RADIUS = 28f
    }

    private var styleOf: ((KuitoLayoutNode) -> KuitoViewStyle?)? = null

    /** The view the sheet's inset pads, when not the sheet itself. */
    private var padded: KuitoViewStyle? = null

    /** Presented, not placed: its own window routes touches to the tree's gestures. */
    override fun style(style: KuitoViewStyle, tree: KuitoTreeLinks) {
        style.sheet = this
        gestures = GestureHandlerRootHelper(this, tree.gestures)
        styleOf = tree.style
    }

    var snapPoints: List<SnapPoint> = listOf(SnapPoint.Content)
        set(value) {
            field = value
            sheetDialog?.configure()
        }

    var grabber = true
        set(value) {
            field = value
            sheetDialog?.configure()
        }

    var dismissible = true
        set(value) {
            field = value
            sheetDialog?.configure()
            (dialog as? KuitoModalDialog)?.setCancelable(value)
        }

    var cornerRadius = CORNER_RADIUS
        set(value) {
            field = value
            sheetDialog?.configure()
        }

    /** Read when the sheet presents: a change shows at the next present. */
    var presentation = SheetPresentation.Sheet

    /** The sheet's motion source, moved by the dialog's slide. */
    val motion = KuitoSheetMotion(this, emit)
    override var sendsMotion by motion::on

    var open = false
        set(value) {
            if (value == field) return

            field = value
            // Not View.post: a sheet's content is detached until presented.
            main.post(::syncPresentation)
        }

    private var dialog: Dialog? = null
    private val sheetDialog get() = dialog as? KuitoSheetDialog
    private val main = android.os.Handler(android.os.Looper.getMainLooper())
    private val density get() = resources.displayMetrics.density

    /** The content's height at the current width, in px, without system insets. */
    var contentHeight = 0
        private set

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val node = node ?: return setMeasuredDimension(0, 0)
        val width = MeasureSpec.getSize(widthSpec)

        // A modal's stack fills the dialog and keeps its screens clear of the bars.
        if (presentation != SheetPresentation.Sheet) {
            val height = MeasureSpec.getSize(heightSpec)

            pad(node, FloatArray(4))
            node.calculate(width / density, height / density, density)
            setMeasuredDimension(width, height)
            measureChildren()

            return
        }

        val insets = ViewCompat.getRootWindowInsets(this)
            ?.getInsets(WindowInsetsCompat.Type.navigationBars() or WindowInsetsCompat.Type.displayCutout())

        pad(node, floatArrayOf(0f, (insets?.right ?: 0) / density, (insets?.bottom ?: 0) / density, (insets?.left ?: 0) / density))

        // Several snap points make the sheet taller than its content: content
        // that grows fills it, as on iOS, so it lays out at the sheet's height.
        val filled = MeasureSpec.getMode(heightSpec) == MeasureSpec.EXACTLY

        if (!filled || SnapPoint.Content in snapPoints) {
            node.calculate(width / density, Float.NaN, density)

            val height = (node.box().height * density).roundToInt()

            if (height != contentHeight) {
                contentHeight = height
                main.post { sheetDialog?.configure() }
            }
        }

        if (filled) node.calculate(width / density, MeasureSpec.getSize(heightSpec) / density, density)

        setMeasuredDimension(width, if (filled) MeasureSpec.getSize(heightSpec) else contentHeight)
        measureChildren()
    }

    /**
     * Gives the inset to the sheet's only view, as Android gives a window's
     * content its insets: that view's background (a sheet route's screen)
     * runs to the sheet's edges, under the navigation bar, while its content
     * stays clear. Several views share the sheet's own inset; a SafeArea
     * pads itself, so it gets none.
     */
    private fun pad(node: KuitoLayoutNode, inset: FloatArray) {
        val children = node.children
        val only = children.singleOrNull()?.takeIf { it.view !is KuitoSafeAreaLayout }
        val content = only?.let { child -> padded?.takeIf { it.layout === child } ?: styleOf?.invoke(child) }

        padded?.takeIf { it !== content && children.any { child -> child === it.layout } }?.let { previous ->
            previous.safeAreaInset = FloatArray(4)
            previous.applyInset(previous.view ?: this)
        }

        padded = content

        if (content == null) return node.setInset(inset[0], inset[1], inset[2], inset[3])

        node.setInset(0f, 0f, 0f, 0f)
        content.safeAreaInset = inset
        content.applyInset(content.view ?: this)
    }

    /** Dismisses without reporting `close`: the app removed or closed the sheet. */
    fun dismissFromApp() {
        open = false
        dialog?.dismiss()
        dialog = null
    }

    fun snapped(index: Int) = emit("snap", KuitoIndexPayload(index.toDouble()))

    /** The dialog this sheet presents in, by its presentation. */
    fun makeDialog(): Dialog = if (presentation == SheetPresentation.Sheet) KuitoSheetDialog(this) else KuitoModalDialog(this)

    private fun syncPresentation() {
        if (open && dialog == null) {
            dialog = makeDialog().also { sheet ->
                sheet.setOnCancelListener {
                    dialog = null
                    open = false
                    emit("close", null)
                }
                sheet.show()
            }
        } else if (!open) {
            dialog?.dismiss()
            dialog = null
        }
    }

    /** Pixels for each snap point, smallest first, within the screen. */
    fun snapHeights(screen: Int): List<Int> = snapPoints.map { point ->
        when (point) {
            is SnapPoint.Points -> (point.dp * density).roundToInt()
            is SnapPoint.Fraction -> (screen * point.value.coerceIn(0f, 1f)).roundToInt()
            SnapPoint.Content -> contentHeight
        }.coerceIn(1, screen)
    }.sorted()
}

/** Material's dialog around the sheet's content: drag handle, rounded top, snap points. */
internal class KuitoSheetDialog(private val content: KuitoSheetLayout) :
    BottomSheetDialog(content.context, R.style.KuitoSheetDialog) {
    private val handle = BottomSheetDragHandleView(context)
    private val frame = FrameLayout(context).apply { clipToOutline = true }
    private val coordinator get() = findViewById<View>(com.google.android.material.R.id.coordinator)

    /** Material's coordinator, the whole window: its offsets count from its top. The screen's until laid out. */
    private val parentHeight get() = coordinator?.height?.takeIf { it > 0 } ?: content.resources.displayMetrics.heightPixels

    /** The height the sheet can take: the window below the status bar, where Material stops it. Snap points are fractions of it. */
    private val available: Int
        get() {
            val statusBar = coordinator?.let(ViewCompat::getRootWindowInsets)?.getInsets(WindowInsetsCompat.Type.statusBars())?.top ?: 0

            return parentHeight - statusBar
        }

    init {
        // Measure before the first configure: a zero-height snap point would
        // read as hidden and cancel the dialog.
        val screenWidth = content.resources.displayMetrics.widthPixels

        content.measure(
            View.MeasureSpec.makeMeasureSpec(screenWidth, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
        )
        (content.parent as? ViewGroup)?.removeView(content)
        // The handle floats over the content's top, as iOS draws its grabber,
        // so the content's background fills the whole sheet.
        frame.addView(content, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        frame.addView(handle, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, android.view.Gravity.TOP))
        setContentView(frame)
        // As in KuitoModalDialog: AppCompat's setContentView leaves a stack inside no back dispatcher.
        window?.decorView?.setViewTreeOnBackPressedDispatcherOwner(this)
        // Content runs edge to edge under the navigation bar (R.style.KuitoSheetDialog;
        // Material requires a translucent bar too); the layout keeps it clear.
        window?.navigationBarColor = Color.TRANSPARENT
        coordinator?.addOnLayoutChangeListener { view, _, top, _, bottom, _, oldTop, _, oldBottom ->
            if (bottom - top != oldBottom - oldTop) view.post(::configure)
        }
        behavior.addBottomSheetCallback(object : BottomSheetBehavior.BottomSheetCallback() {
            override fun onStateChanged(sheet: View, state: Int) {
                index(state)?.let(content::snapped)
            }

            override fun onSlide(sheet: View, offset: Float) = moved(sheet)
        })
        configure()
    }

    override fun onStart() {
        super.onStart()
        // The dialog's own surface would show around our content.
        findViewById<FrameLayout>(com.google.android.material.R.id.design_bottom_sheet)?.background = null
        configure()

        // Open at the first snap point.
        behavior.state =
            if (content.snapPoints.size > 1) BottomSheetBehavior.STATE_COLLAPSED else BottomSheetBehavior.STATE_EXPANDED
    }

    /** Where the sheet stands over the screen's bottom, against its snap points. */
    private fun moved(sheet: View) {
        val parent = sheet.parent as? View ?: return
        val heights = content.snapHeights(available)

        content.motion.moved(parent.height - sheet.top, heights.minOrNull() ?: 0, heights.maxOrNull() ?: 0)
    }

    /** Material rests at up to three heights: collapsed, half-expanded and expanded. */
    fun configure() {
        val parent = parentHeight
        val heights = content.snapHeights(available)
        val radius = content.cornerRadius * content.resources.displayMetrics.density

        handle.visibility = if (content.grabber) View.VISIBLE else View.GONE
        // With several snap points the sheet can be taller than its content;
        // the content (and its background) fills it, as on iOS.
        fill(heights.size > 1)
        frame.outlineProvider = object : ViewOutlineProvider() {
            override fun getOutline(view: View, outline: Outline) {
                outline.setRoundRect(0, 0, view.width, view.height + radius.roundToInt(), radius)
            }
        }
        setCancelable(content.dismissible)
        behavior.isHideable = content.dismissible
        behavior.skipCollapsed = heights.size == 1
        behavior.isFitToContents = heights.size == 1
        behavior.maxHeight = heights.last()

        if (heights.size > 1) {
            behavior.peekHeight = heights.first()
            behavior.expandedOffset = parent - heights.last()

            // Material always has a half-expanded rest (half the screen by
            // default): with two snap points it sits on the lower one.
            behavior.halfExpandedRatio = (heights[heights.size - 2].toFloat() / parent).coerceIn(0.01f, 0.99f)
        }

        if (heights.size == 1) behavior.state = BottomSheetBehavior.STATE_EXPANDED
    }

    private fun fill(full: Boolean) {
        val height = if (full) ViewGroup.LayoutParams.MATCH_PARENT else ViewGroup.LayoutParams.WRAP_CONTENT

        for (view in listOf(frame, content)) {
            val params = view.layoutParams ?: continue

            if (params.height != height) view.layoutParams = params.also { it.height = height }
        }

        findViewById<FrameLayout>(com.google.android.material.R.id.design_bottom_sheet)?.let { sheet ->
            val params = sheet.layoutParams ?: return@let

            if (params.height != height) sheet.layoutParams = params.also { it.height = height }
        }
    }

    private fun index(state: Int): Int? {
        val count = content.snapPoints.size

        return when (state) {
            BottomSheetBehavior.STATE_COLLAPSED -> 0
            BottomSheetBehavior.STATE_HALF_EXPANDED -> if (count > 2) 1 else 0
            BottomSheetBehavior.STATE_EXPANDED -> count - 1
            else -> null
        }
    }
}
