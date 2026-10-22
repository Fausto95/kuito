package dev.kuito.runtime.renderer.views

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.widget.ImageView

/**
 * A Material Symbol by name, at a size in dp and a weight, in its tint (black
 * by default, as Text is). The kernel sizes the view to a square of the size
 * unless the app sizes it (src/runtime/intrinsic-size.ts); the symbol fits
 * inside.
 */
@SuppressLint("AppCompatCustomView")
internal class KuitoSymbolView(context: Context) : ImageView(context), KuitoTintable {
    private var name: String? = null
    private var sizeDp = KuitoSymbols.SIZE_DP
    private var weight = "regular"

    override var tint: Int? = null
        set(value) {
            field = value
            imageTintList = ColorStateList.valueOf(value ?: Color.BLACK)
        }

    init {
        scaleType = ScaleType.FIT_CENTER
        imageTintList = ColorStateList.valueOf(Color.BLACK)
    }

    /** Throws for a name no Material Symbol has. */
    fun setName(next: String?) {
        name = next
        draw()
    }

    fun setSize(next: Float?) {
        sizeDp = next?.takeIf { it > 0f } ?: KuitoSymbols.SIZE_DP
        draw()
    }

    fun setWeight(next: String) {
        weight = next
        draw()
    }

    private fun draw() {
        setImageDrawable(name?.let { KuitoSymbols.drawable(context, it, sizeDp, weight) })
    }
}
