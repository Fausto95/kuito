package dev.kuito.runtime.renderer.properties

import android.graphics.Typeface
import android.os.Build
import android.util.DisplayMetrics
import android.util.TypedValue
import android.view.Gravity
import android.widget.EditText
import android.widget.TextView
import dev.kuito.runtime.renderer.KuitoValue
import dev.kuito.runtime.renderer.keyboard.KuitoEditText
import dev.kuito.runtime.renderer.styling.KuitoFonts
import dev.kuito.runtime.renderer.styling.KuitoViewStyle

/** Text content and typography for text views, buttons and fields. */
internal object KuitoTextProperties {
    val setters: Map<String, KuitoPropertySetter> = mapOf(
        "text" to remeasured(text { view, context, value ->
            val text = context.text(value)

            if (view is KuitoEditText) {
                if (view.text.toString() != text) view.setTextQuietly(text)
            } else {
                context.style.text = text
                view.text = context.style.displayText()
            }
        }),
        "color" to text { view, context, value ->
            val initial = context.style.initialTextColors ?: view.textColors.also { context.style.initialTextColors = it }

            if (value == KuitoValue.Null) view.setTextColor(initial) else view.setTextColor(context.color(value))
        },
        "fontSize" to remeasured(text { view, context, value ->
            context.style.fontSize = context.number(value)
            size(view, context.style, view.resources.displayMetrics)
        }),
        "fontWeight" to remeasured(typeface { style, context, value ->
            style.fontWeight = WEIGHTS[context.keyword(value)] ?: context.unsupportedValue(value, "expects one of its values")
        }),
        "fontFamily" to remeasured { context, value ->
            val family = if (value == KuitoValue.Null) null else context.text(value)

            if (family != null && !KuitoFonts.has(context.view.context, family)) context.unsupportedValue(value, KuitoFonts.missing(family))

            typeface { style, _, _ -> style.fontFamily = family }(context, value)
        },
        "fontStyle" to remeasured(typeface { style, context, value -> style.italic = context.keyword(value) == "italic" }),
        // Android letter spacing is in em of the text size.
        "letterSpacing" to remeasured { context, value ->
            val view = context.view as? TextView ?: context.unsupportedProp()

            view.letterSpacing = context.number(value) * context.density / view.textSize.coerceAtLeast(1f)
        },
        "lineHeight" to remeasured { context, value ->
            val view = context.view as? TextView ?: context.unsupportedProp()
            // Unset, the font's own line spacing: setting a height adds the rest as extra spacing.
            when {
                value == KuitoValue.Null -> view.setLineSpacing(0f, 1f)
                Build.VERSION.SDK_INT >= 28 -> view.lineHeight = context.dp(context.number(value))
                else -> context.number(value)
            }
        },
        "textAlign" to text { view, context, value ->
            view.gravity = when (if (value == KuitoValue.Null) null else context.keyword(value)) {
                "center" -> Gravity.CENTER_HORIZONTAL
                "right" -> Gravity.END
                else -> Gravity.START
            }
        },
        // Text and Button only, as on iOS: an EditText refuses a transformation that may change the text's length.
        "textTransform" to remeasured(text { view, context, value ->
            if (view is EditText) context.unsupportedProp()

            context.style.textTransform = context.keyword(value)
            // The text itself carries the transform, so min-content measures
            // what is drawn. All caps stays off: `none` shows the text as
            // written even where the theme capitalizes buttons.
            view.isAllCaps = false
            view.text = context.style.displayText()
        }),
        "lineClamp" to remeasured(text { view, context, value ->
            view.maxLines = context.number(value).toInt().takeIf { it > 0 } ?: Int.MAX_VALUE
        }),
        "maxFontScale" to remeasured(text { view, context, value ->
            val metrics = view.resources.displayMetrics

            if (value == KuitoValue.Null) {
                context.style.maxFontScale = null
            } else {
                val scale = context.number(value)

                if (scale < 1f) context.unsupportedValue(value, "expects 1 or more: it caps how much the user's font size enlarges the text")

                // The theme's size, as sp, before a cap shrinks its pixels.
                if (context.style.fontSize == null) context.style.fontSize = sp(view.textSize, metrics)

                context.style.maxFontScale = scale
            }

            if (context.style.fontSize != null) size(view, context.style, metrics)
        }),
    )

    /** fontWeight's values (the manifest's) as weights. */
    private val WEIGHTS = mapOf(
        "normal" to 400, "bold" to 700, "100" to 100, "200" to 200, "300" to 300, "400" to 400,
        "500" to 500, "600" to 600, "700" to 700, "800" to 800, "900" to 900,
    )

    /**
     * A font scale change: text sizes are sp, fixed in pixels when set, so
     * each is set again in sp. The sp comes from [previous], the metrics the
     * pixels were derived with: Android 14 scales large text less than small
     * text, and a theme's default size was never a prop. A size a prop set
     * is set again from it at [current], capped by `maxFontScale`. Letter
     * spacing is in em and was set from dp, so it keeps its pixels.
     */
    fun rescale(view: TextView, style: KuitoViewStyle, previous: DisplayMetrics, current: DisplayMetrics) {
        if (style.fontSize != null) return size(view, style, current)

        val pixels = view.textSize

        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp(pixels, previous))
        view.letterSpacing *= pixels / view.textSize.coerceAtLeast(1f)
    }

    /** `fontSize` sp at the user's font scale, never more than `maxFontScale` times its size in dp. */
    fun pixels(fontSize: Float, maxFontScale: Float?, metrics: DisplayMetrics): Float {
        val scaled = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, fontSize, metrics)

        return maxFontScale?.let { minOf(scaled, fontSize * it * metrics.density) } ?: scaled
    }

    /** Sets the text's pixels from its sp size; letter spacing, in em, keeps its pixels. */
    private fun size(view: TextView, style: KuitoViewStyle, metrics: DisplayMetrics) {
        val fontSize = style.fontSize ?: return
        val pixels = view.textSize

        view.setTextSize(TypedValue.COMPLEX_UNIT_PX, pixels(fontSize, style.maxFontScale, metrics))
        view.letterSpacing *= pixels / view.textSize.coerceAtLeast(1f)
    }

    @Suppress("DEPRECATION") // scaledDensity is the linear scale Android used before 14.
    private fun sp(pixels: Float, metrics: DisplayMetrics) =
        if (Build.VERSION.SDK_INT >= 34) TypedValue.deriveDimension(TypedValue.COMPLEX_UNIT_SP, pixels, metrics)
        else pixels / metrics.scaledDensity

    /** Props every TextView (and so Button and EditText) supports. */
    private fun text(apply: (TextView, KuitoPropertyContext, KuitoValue) -> Unit): KuitoPropertySetter = { context, value ->
        apply(context.view as? TextView ?: context.unsupportedProp(), context, value)
    }

    private fun typeface(change: (KuitoViewStyle, KuitoPropertyContext, KuitoValue) -> Unit): KuitoPropertySetter =
        text { view, context, value ->
            change(context.style, context, value)
            view.typeface = typefaceFor(view, context.style)
        }

    /** A bundled or loaded family's nearest face (KuitoFonts); otherwise the system's, weighted and slanted. */
    private fun typefaceFor(view: TextView, style: KuitoViewStyle): Typeface {
        style.fontFamily?.let { KuitoFonts.typeface(view.context, it, style.fontWeight, style.italic) }?.let { return it }

        val base = Typeface.create(style.fontFamily, Typeface.NORMAL)

        if (Build.VERSION.SDK_INT >= 28) return Typeface.create(base, style.fontWeight, style.italic)

        val bold = style.fontWeight >= 600

        return Typeface.create(base, when {
            bold && style.italic -> Typeface.BOLD_ITALIC
            bold -> Typeface.BOLD
            style.italic -> Typeface.ITALIC
            else -> Typeface.NORMAL
        })
    }
}
