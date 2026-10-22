package dev.kuito.runtime.renderer.views

import android.content.Context
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.view.View
import android.view.ViewGroup
import dev.kuito.runtime.renderer.images.CachePolicy
import dev.kuito.runtime.renderer.images.KuitoImageLoader

/**
 * NavigationTab: one tab's content, the tab's NavigationStack, filling the
 * area above the tab bar. Its title and icon, a Material Symbol or a loaded
 * image, are its tab bar item; an image that fails to load is
 * reported through `failed`.
 */
internal class KuitoNavigationTabLayout(
    context: Context,
    private val failed: (String) -> Unit,
) : ViewGroup(context), KuitoTitled {
    override var title = ""
        set(value) {
            if (value == field) return

            field = value
            (parent as? KuitoNavigationTabsLayout)?.itemsChanged()
        }

    var icon: Drawable? = null
        private set(value) {
            if (value == field) return

            field = value
            (parent as? KuitoNavigationTabsLayout)?.itemsChanged()
        }

    private var source: String? = null

    /** A Material Symbol by name; null shows none. */
    fun setSymbol(name: String?) {
        source = null
        icon = name?.let { KuitoSymbols.drawable(context, it) }
    }

    /** An image icon, by URL; the bar sizes and tints it like a built-in one. */
    fun loadIcon(url: String) {
        if (url == source) return

        source = url
        icon = null
        KuitoImageLoader.load(context, url, emptyMap(), CachePolicy.MemoryDisk, null) { result ->
            if (source != url) return@load

            result
                .onSuccess { icon = BitmapDrawable(resources, it.bitmap) }
                .onFailure { failed(it.message ?: it.javaClass.simpleName) }
        }
    }

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val width = MeasureSpec.getSize(widthSpec)
        val height = MeasureSpec.getSize(heightSpec)

        setMeasuredDimension(width, height)

        for (index in 0 until childCount) {
            val child = getChildAt(index)

            if (child.visibility != View.GONE)
                child.measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY))
        }
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        for (index in 0 until childCount) {
            val child = getChildAt(index)

            if (child.visibility != View.GONE) child.layout(0, 0, right - left, bottom - top)
        }
    }
}
