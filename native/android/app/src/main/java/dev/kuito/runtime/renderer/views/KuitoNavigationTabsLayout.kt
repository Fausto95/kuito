package dev.kuito.runtime.renderer.views

import android.annotation.SuppressLint
import android.content.Context
import android.view.Menu
import android.view.View
import android.view.ViewGroup
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.android.material.navigation.NavigationBarView
import dev.kuito.runtime.renderer.KuitoHost
import dev.kuito.runtime.renderer.KuitoRenderError

/**
 * NavigationTabs: Material's bottom navigation, one item per NavigationTab,
 * over the selected tab's content. Every tab keeps its view tree; the others
 * are hidden. A user's pick shows its tab at once and emits `select`; the
 * kernel's `selectedIndex` follows it, and setting it never emits.
 */
@SuppressLint("ViewConstructor")
internal class KuitoNavigationTabsLayout(
    context: Context,
    private val selected: (Int) -> Unit,
) : ViewGroup(context), KuitoHost {
    private val bar = BottomNavigationView(context.materialThemed()).apply {
        labelVisibilityMode = NavigationBarView.LABEL_VISIBILITY_LABELED
    }

    private val tabs = mutableListOf<KuitoNavigationTabLayout>()

    /** The kernel's selection. Tabs may arrive after it, so it applies at the next measure. */
    var selectedIndex = 0
        set(value) {
            if (value == field) return

            field = value
            selectionChanged = true
            requestLayout()
        }

    private var itemsChanged = false
    private var selectionChanged = false
    private var syncing = false

    init {
        addView(bar, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
        bar.setOnItemSelectedListener { item ->
            if (!syncing) {
                show(item.itemId)
                selected(item.itemId)
            }

            true
        }
    }

    override fun adopt(child: View, label: String, index: Int?) = place(child, index)

    override fun move(child: View, index: Int) = place(child, index)

    /** Puts [child] at [index] (null: last); adds it if new. */
    private fun place(child: View, index: Int?) {
        val tab = child as? KuitoNavigationTabLayout ?: throw KuitoRenderError.InvalidTree("only a NavigationTab goes in NavigationTabs")

        if (tab !in tabs) if (tabs.size >= bar.maxItemCount) throw KuitoRenderError.InvalidTree("NavigationTabs shows at most ${bar.maxItemCount} tabs on Android")

        tabs.remove(tab)
        tabs.add((index ?: tabs.size).coerceIn(0, tabs.size), tab)

        if (tab.parent !== this) addView(tab, 0, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))

        itemsChanged()
    }

    override fun release(child: View, gone: () -> Unit) {
        tabs.remove(child)
        removeView(child)
        itemsChanged()
        gone()
    }

    override fun animatesRemoval(child: View) = false

    /** Titles or order changed; the next measure rebuilds the bar's items. */
    fun itemsChanged() {
        itemsChanged = true
        requestLayout()
    }

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val width = MeasureSpec.getSize(widthSpec)
        val height = MeasureSpec.getSize(heightSpec)

        if (itemsChanged || selectionChanged) sync()

        setMeasuredDimension(width, height)
        bar.measure(exactly(width), MeasureSpec.makeMeasureSpec(height, MeasureSpec.AT_MOST))

        val content = (height - bar.measuredHeight).coerceAtLeast(0)

        tabs.forEach { tab -> if (tab.visibility != View.GONE) tab.measure(exactly(width), exactly(content)) }
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        val width = right - left
        val content = (bottom - top - bar.measuredHeight).coerceAtLeast(0)

        tabs.forEach { tab -> if (tab.visibility != View.GONE) tab.layout(0, 0, width, content) }
        bar.layout(0, content, width, bottom - top)
    }

    private fun sync() {
        syncing = true

        try {
            // Rebuilding the items resets the selection, so it is set again after.
            if (itemsChanged) {
                bar.menu.clear()
                tabs.forEachIndexed { index, tab ->
                    val item = bar.menu.add(Menu.NONE, index, index, tab.title)

                    tab.icon?.let(item::setIcon)
                }
            }

            // The kernel checks the index against its tabs; before they have
            // all arrived, the last one so far stands in.
            val index = selectedIndex.coerceAtMost(tabs.lastIndex)

            if (index >= 0) bar.selectedItemId = index

            show(index)
        } finally {
            itemsChanged = false
            selectionChanged = false
            syncing = false
        }
    }

    private fun show(index: Int) {
        tabs.forEachIndexed { position, tab -> tab.visibility = if (position == index) View.VISIBLE else View.GONE }
    }

    private fun exactly(size: Int) = MeasureSpec.makeMeasureSpec(size, MeasureSpec.EXACTLY)
}
