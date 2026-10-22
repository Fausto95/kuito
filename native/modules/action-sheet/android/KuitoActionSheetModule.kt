package dev.kuito.runtime.modules.actionsheet

import android.app.Dialog
import android.content.Context
import android.graphics.Color
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.color.MaterialColors
import com.google.android.material.divider.MaterialDivider
import dev.kuito.link.ActionSheetAnswer
import dev.kuito.link.ActionSheetRequest
import dev.kuito.link.ActionSheetSpec
import dev.kuito.runtime.link.KuitoPromise
import dev.kuito.runtime.modules.KuitoModuleContext
import dev.kuito.runtime.renderer.styling.cssColor

/**
 * `ActionSheet` in native/modules/action-sheet/action-sheet.ts: a Material
 * bottom sheet with a row per option, the cancel option last, below a divider.
 * Swiping the sheet away, Back or a tap outside dismisses it. A reload closes
 * the open ones.
 */
class KuitoActionSheetModule(private val context: KuitoModuleContext) : ActionSheetSpec {
    // UI thread only.
    private val open = mutableSetOf<Dialog>()

    override fun show(request: ActionSheetRequest, promise: KuitoPromise<ActionSheetAnswer>) {
        val dialog = BottomSheetDialog(context.activity, com.google.android.material.R.style.Theme_Material3_DayNight_BottomSheetDialog)
        val themed = dialog.context
        val options = request.options
        val cancel = request.cancelButtonIndex?.toInt()
        val destructive = request.destructiveButtonIndices.map(Double::toInt).toSet()
        val disabled = request.disabledButtonIndices.map(Double::toInt).toSet()
        val tint = request.tintColor?.let(::cssColor)
        val list = LinearLayout(themed).apply { orientation = LinearLayout.VERTICAL }
        var picked: Int? = null

        request.title?.let { list.addView(label(themed, it, TITLE, com.google.android.material.R.attr.colorOnSurface)) }
        request.message?.let { list.addView(label(themed, it, BODY, com.google.android.material.R.attr.colorOnSurfaceVariant)) }

        val order = options.indices.filter { it != cancel } + listOfNotNull(cancel)

        order.forEach { index ->
            if (index == cancel && order.size > 1) list.addView(MaterialDivider(themed))

            val color = when {
                index in destructive -> MaterialColors.getColor(themed, com.google.android.material.R.attr.colorError, Color.RED)
                else -> tint ?: MaterialColors.getColor(themed, com.google.android.material.R.attr.colorOnSurface, Color.BLACK)
            }

            list.addView(row(themed, options[index], color, enabled = index !in disabled) {
                picked = index
                dialog.dismiss()
            })
        }

        // The sheet runs under the navigation bar; its last row stays above it.
        val bottom = dp(themed, 8f)

        ViewCompat.setOnApplyWindowInsetsListener(list) { view, insets ->
            view.updatePadding(bottom = bottom + insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom)
            insets
        }
        list.updatePadding(top = dp(themed, 16f), bottom = bottom)
        dialog.setContentView(list)
        dialog.behavior.state = BottomSheetBehavior.STATE_EXPANDED
        dialog.behavior.skipCollapsed = true
        // One answer, whichever way the sheet closes.
        dialog.setOnDismissListener {
            open.remove(dialog)
            promise.resolve(ActionSheetAnswer(index = picked?.toDouble()))
        }
        open.add(dialog)
        dialog.show()
    }

    override fun destroy() {
        open.toList().forEach(Dialog::dismiss)
        open.clear()
    }

    private fun label(themed: Context, text: String, appearance: Int, color: Int) = TextView(themed).apply {
        this.text = text
        setTextAppearance(appearance)
        setTextColor(MaterialColors.getColor(themed, color, Color.BLACK))
        setPadding(dp(themed, 24f), dp(themed, 4f), dp(themed, 24f), dp(themed, 8f))
    }

    private fun row(themed: Context, text: String, color: Int, enabled: Boolean, onPick: () -> Unit) = TextView(themed).apply {
        this.text = text
        setTextAppearance(ROW)
        setTextColor(color)
        gravity = Gravity.CENTER_VERTICAL
        minHeight = dp(themed, 56f)
        setPadding(dp(themed, 24f), 0, dp(themed, 24f), 0)
        isEnabled = enabled
        alpha = if (enabled) 1f else 0.38f
        background = TypedValue().let { value ->
            themed.theme.resolveAttribute(android.R.attr.selectableItemBackground, value, true)
            themed.getDrawable(value.resourceId)
        }
        setOnClickListener(View.OnClickListener { onPick() })
    }

    private companion object {
        val TITLE = com.google.android.material.R.style.TextAppearance_Material3_TitleMedium
        val BODY = com.google.android.material.R.style.TextAppearance_Material3_BodyMedium
        val ROW = com.google.android.material.R.style.TextAppearance_Material3_BodyLarge

        fun dp(context: Context, value: Float) = (value * context.resources.displayMetrics.density).toInt()
    }
}
