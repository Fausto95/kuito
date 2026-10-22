package dev.kuito.runtime.renderer.views

import android.annotation.SuppressLint
import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.content.res.AppCompatResources
import androidx.core.widget.TextViewCompat
import com.google.android.material.appbar.MaterialToolbar
import dev.kuito.runtime.renderer.KuitoEventPayload
import dev.kuito.runtime.renderer.layout.KuitoFlexLayout
import kotlin.math.roundToInt

/**
 * NavigationScreen: the root of one screen's subtree, laid out with the shared
 * engine in the frame its stack gives it (below its header). The header is the
 * screen's own state: its toolbar, the large title under it, and the actions
 * on it (KuitoHeaderActions); its page shows it.
 */
@SuppressLint("ViewConstructor")
internal class KuitoNavigationScreenLayout(
    context: Context,
    private val emit: (String, KuitoEventPayload?) -> Unit,
) : KuitoFlexLayout(context), KuitoTitled {
    val header = MaterialToolbar(context.materialThemed()).apply {
        setNavigationContentDescription(androidx.appcompat.R.string.abc_action_bar_up_description)
    }

    /** Material 3's large top app bar: the title in headline type, 16dp from the sides and 28dp above the content. */
    val largeTitle = TextView(header.context).apply {
        val density = resources.displayMetrics.density

        TextViewCompat.setTextAppearance(this, com.google.android.material.R.style.TextAppearance_Material3_HeadlineMedium)
        setPadding((16 * density).roundToInt(), 0, (16 * density).roundToInt(), (28 * density).roundToInt())
        visibility = View.GONE
    }

    /** What the page places above the screen: the toolbar, and the large title under it. */
    val headerBar = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        addView(header, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        addView(largeTitle, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }

    val actions = KuitoHeaderActions(header, emit)

    override var title = ""
        set(value) {
            field = value
            showTitle()
        }

    var headerShown = true
        set(value) {
            field = value
            headerBar.visibility = if (value) View.VISIBLE else View.GONE
        }

    /** The title under the bar, large, instead of in it. */
    var largeTitleShown = false
        set(value) {
            field = value
            showTitle()
        }

    private fun showTitle() {
        header.title = if (largeTitleShown) "" else title
        largeTitle.text = title
        largeTitle.visibility = if (largeTitleShown) View.VISIBLE else View.GONE
    }

    /** Emits `dismiss`: the platform popped this screen (back, the header's up arrow). */
    fun dismissed() = emit("dismiss", null)

    /** Shows the up arrow: the screen has another below it. */
    var canGoBack = false
        set(value) {
            if (value == field) return

            field = value
            header.navigationIcon =
                if (value) AppCompatResources.getDrawable(header.context, androidx.appcompat.R.drawable.abc_ic_ab_back_material) else null
        }

    /** Runs once the screen's page has left its stack, after any transition. */
    var gone: (() -> Unit)? = null

    /** The page that shows this screen in a stack, made on first use. */
    val page: KuitoNavigationPage by lazy { KuitoNavigationPage(context, this) }

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val node = node ?: return setMeasuredDimension(0, 0)
        val width = MeasureSpec.getSize(widthSpec)
        val height = MeasureSpec.getSize(heightSpec)
        val density = resources.displayMetrics.density

        node.calculate(width / density, height / density, density)
        setMeasuredDimension(width, height)
        measureChildren()
    }
}
