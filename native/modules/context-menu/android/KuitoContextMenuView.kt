package dev.kuito.runtime.modules.contextmenu

import android.content.Context
import android.graphics.Color
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.view.ContextMenu
import android.view.GestureDetector
import android.view.Menu
import android.view.MotionEvent
import com.google.android.material.R as MaterialR
import com.google.android.material.color.MaterialColors
import dev.kuito.runtime.modules.KuitoErrorCode
import dev.kuito.runtime.modules.KuitoModuleError
import dev.kuito.runtime.modules.KuitoType
import dev.kuito.runtime.modules.KuitoViewDefinition
import dev.kuito.runtime.modules.KuitoViewEvents
import dev.kuito.runtime.renderer.layout.KuitoFlexLayout
import dev.kuito.runtime.renderer.views.materialThemed

/**
 * `ContextMenu` in native/modules/context-menu/context-menu.ts: a container
 * around its children, laid out by the engine as a Box, whose long press
 * opens Android's floating context menu of its items at the touch. Its props
 * are defined here, beside the view, as on iOS.
 */
internal class KuitoContextMenuView(context: Context, private val events: KuitoViewEvents) : KuitoFlexLayout(context) {

    class Item(val value: String, val label: String, val destructive: Boolean, val disabled: Boolean)

    private var items = emptyList<Item>()
        set(next) { field = next; follow() }
    private var title: String? = null
    private var disabled = false
        set(next) { field = next; follow() }
    private val opens get() = !disabled && items.isNotEmpty()

    /**
     * Sees every touch in the view, those its children handle too: a
     * long-press listener alone hears only the touches no child takes.
     */
    private val presses = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
        override fun onLongPress(event: MotionEvent) {
            if (opens && showContextMenu(event.x, event.y)) open(event)
        }
    })
    private var opened = false

    init {
        setOnCreateContextMenuListener { menu, _, _ -> fill(menu) }
        follow()
    }

    /** Lists the items in [menu]: the window's context menu, as a long press opens it. */
    fun fill(menu: Menu) {
        if (!opens) return
        if (menu is ContextMenu && title != null) menu.setHeaderTitle(title)

        val error = MaterialColors.getColor(context.materialThemed(), MaterialR.attr.colorError, Color.RED)

        items.forEachIndexed { index, item ->
            val label = if (!item.destructive) item.label else SpannableString(item.label).apply {
                setSpan(ForegroundColorSpan(error), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }

            menu.add(Menu.NONE, index, index, label).apply {
                isEnabled = !item.disabled
                setOnMenuItemClickListener {
                    events.emit("select", mapOf("value" to item.value))
                    true
                }
            }
        }
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_DOWN) opened = false
        if (opened) return true

        presses.onTouchEvent(event)

        // Without the rest of a touch no child takes, a tap would look like a press that never lifts.
        return super.dispatchTouchEvent(event) || opens
    }

    /** The touch that opened the menu ends for the children, as a press that became a long press. */
    private fun open(event: MotionEvent) {
        opened = true

        val cancel = MotionEvent.obtain(event).apply { action = MotionEvent.ACTION_CANCEL }

        super.dispatchTouchEvent(cancel)
        cancel.recycle()
    }

    /** A screen reader's long press opens the menu too, while it has one. */
    private fun follow() {
        isLongClickable = opens
    }

    companion object {
        /** Items whose values differ: a value names one item. */
        private val list = KuitoType { value ->
            val items = KuitoType.list(KuitoType.obj).decode(value).map { item ->
                Item(
                    KuitoType.string.decode(item.opt("value") ?: missing("value")),
                    KuitoType.string.decode(item.opt("label") ?: missing("label")),
                    item.opt("destructive")?.let(KuitoType.boolean::decode) ?: false,
                    item.opt("disabled")?.let(KuitoType.boolean::decode) ?: false,
                )
            }

            if (items.distinctBy { it.value }.size != items.size) throw KuitoModuleError(KuitoErrorCode.ARGUMENT, "two items have the same value")
            items
        }

        private fun missing(field: String): Nothing = throw KuitoModuleError(KuitoErrorCode.ARGUMENT, "an item has no $field")

        fun define(view: KuitoViewDefinition<KuitoContextMenuView>) {
            view.prop("items", KuitoType.optional(list)) { menu, value -> menu.items = value ?: emptyList() }
            view.prop("title", KuitoType.optional(KuitoType.string)) { menu, value -> menu.title = value }
            view.prop("disabled", KuitoType.optional(KuitoType.boolean)) { menu, value -> menu.disabled = value == true }
        }
    }
}
