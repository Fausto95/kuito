package dev.kuito.runtime.renderer.views

import android.content.res.ColorStateList
import android.graphics.Color
import android.view.MenuItem
import android.view.View
import androidx.activity.OnBackPressedCallback
import androidx.activity.findViewTreeOnBackPressedDispatcherOwner
import androidx.appcompat.widget.SearchView
import androidx.core.view.MenuItemCompat
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.color.MaterialColors
import dev.kuito.runtime.renderer.KuitoEventPayload
import dev.kuito.runtime.renderer.KuitoIndexPayload
import dev.kuito.runtime.renderer.KuitoTextPayload
import dev.kuito.runtime.renderer.KuitoHeaderIconValue
import dev.kuito.runtime.renderer.KuitoHeaderItemValue
import dev.kuito.runtime.renderer.KuitoHeaderPlacementValue
import dev.kuito.runtime.renderer.KuitoHeaderSearchValue

/** One button of a screen's header (docs/navigation.md#headers): its label, the Material Symbol shown instead, and its side. */
internal data class KuitoHeaderItem(val label: String, val icon: String?, val disabled: Boolean, val leading: Boolean) {
    companion object {
        /** The `headerItems` prop's items, in order: their index is what a press reports. */
        fun list(items: List<KuitoHeaderItemValue>): List<KuitoHeaderItem> = items.map { item ->
            KuitoHeaderItem(item.label, symbol(item.icon), item.disabled ?: false, item.placement == KuitoHeaderPlacementValue.LEADING)
        }

        /** A symbol name, or `{ ios, android }` names: Android takes its own. */
        private fun symbol(icon: KuitoHeaderIconValue?): String? = when (icon) {
            is KuitoHeaderIconValue.Symbol -> icon.value
            is KuitoHeaderIconValue.Platforms -> icon.value.android?.takeIf { it.isNotEmpty() }
            null -> null
        }
    }
}

/** The header's search field: the placeholder it shows. */
internal data class KuitoHeaderSearch(val placeholder: String?) {
    companion object {
        fun of(search: KuitoHeaderSearchValue) = KuitoHeaderSearch(search.placeholder)
    }
}

/**
 * A screen's header items and search on its toolbar's menu. Material's top
 * app bar has one leading place, the up arrow, so leading items are the
 * first actions; the search field is the last, a SearchView that expands
 * over the bar, and back closes it before it pops the screen. Presses and
 * search text report as the screen's events.
 */
internal class KuitoHeaderActions(
    private val toolbar: MaterialToolbar,
    private val emit: (String, KuitoEventPayload?) -> Unit,
) {
    private companion object {
        const val ITEMS = 1
        const val SEARCH = 2

        /** Clear of the items' ids, which are their indices. */
        const val SEARCH_ID = Int.MAX_VALUE
        const val SEARCH_ORDER = 1_000
    }

    var items: List<KuitoHeaderItem> = emptyList()
        set(value) {
            if (value == field) return

            field = value
            showItems()
        }

    var search: KuitoHeaderSearch? = null
        set(value) {
            if (value == field) return

            field = value
            showSearch()
        }

    /** Closes the open search: added after the stack's callback, so the dispatcher asks it first. */
    private val closeSearch = object : OnBackPressedCallback(false) {
        override fun handleOnBackPressed() {
            toolbar.menu.findItem(SEARCH_ID)?.collapseActionView()
        }
    }

    init {
        toolbar.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(view: View) {
                toolbar.findViewTreeOnBackPressedDispatcherOwner()?.onBackPressedDispatcher?.addCallback(closeSearch)
            }

            override fun onViewDetachedFromWindow(view: View) = closeSearch.remove()
        })
        toolbar.setOnMenuItemClickListener { item ->
            if (item.groupId != ITEMS) return@setOnMenuItemClickListener false

            emit("headeritem", KuitoIndexPayload(item.itemId.toDouble()))
            true
        }
    }

    private fun showItems() {
        val menu = toolbar.menu

        menu.removeGroup(ITEMS)
        items.withIndex().sortedBy { !it.value.leading }.forEachIndexed { order, (index, item) ->
            menu.add(ITEMS, index, order, item.label).apply {
                icon = item.icon?.let { KuitoSymbols.drawable(toolbar.context, it) }
                MenuItemCompat.setIconTintList(this, tint)
                isEnabled = !item.disabled
                MenuItemCompat.setContentDescription(this, item.label)
                setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
            }
        }
    }

    private fun showSearch() {
        val menu = toolbar.menu
        val search = search ?: return menu.findItem(SEARCH_ID)?.let { item ->
            // An open field outlives its item unless it closes first.
            item.collapseActionView()
            menu.removeGroup(SEARCH)
        } ?: Unit
        val existing = menu.findItem(SEARCH_ID)?.actionView as? SearchView
        val field = existing ?: SearchView(toolbar.context).also { field ->
            field.setOnQueryTextListener(object : SearchView.OnQueryTextListener {
                override fun onQueryTextChange(text: String): Boolean {
                    emit("search", KuitoTextPayload(text))

                    return true
                }

                // False: the field then hides the keyboard, as a search key does.
                override fun onQueryTextSubmit(text: String): Boolean {
                    emit("searchsubmit", KuitoTextPayload(text))

                    return false
                }
            })
            menu.add(SEARCH, SEARCH_ID, SEARCH_ORDER, "").apply {
                icon = KuitoSymbols.drawable(toolbar.context, "search")
                MenuItemCompat.setIconTintList(this, tint)
                actionView = field
                setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS or MenuItem.SHOW_AS_ACTION_COLLAPSE_ACTION_VIEW)
                setOnActionExpandListener(object : MenuItem.OnActionExpandListener {
                    override fun onMenuItemActionExpand(item: MenuItem): Boolean {
                        closeSearch.isEnabled = true

                        return true
                    }

                    override fun onMenuItemActionCollapse(item: MenuItem): Boolean {
                        closeSearch.isEnabled = false

                        return true
                    }
                })
            }
        }

        menu.findItem(SEARCH_ID)?.title = search.placeholder.orEmpty()
        field.queryHint = search.placeholder
    }

    /**
     * Symbols draw white: actions take Material's action color, and a
     * disabled one the 38% opacity Material dims disabled content to.
     */
    private val tint: ColorStateList by lazy {
        val color = MaterialColors.getColor(toolbar, com.google.android.material.R.attr.colorOnSurfaceVariant)
        val disabled = MaterialColors.getColor(toolbar, com.google.android.material.R.attr.colorOnSurface)

        ColorStateList(
            arrayOf(intArrayOf(-android.R.attr.state_enabled), intArrayOf()),
            intArrayOf(Color.argb(97, Color.red(disabled), Color.green(disabled), Color.blue(disabled)), color),
        )
    }
}
