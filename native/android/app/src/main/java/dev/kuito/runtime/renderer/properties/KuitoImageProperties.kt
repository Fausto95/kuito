package dev.kuito.runtime.renderer.properties

import android.widget.ImageView.ScaleType
import dev.kuito.runtime.renderer.images.CachePolicy
import dev.kuito.runtime.renderer.images.KuitoThumbHash
import dev.kuito.runtime.renderer.KuitoImageSourceValue
import dev.kuito.runtime.renderer.KuitoPropValues
import dev.kuito.runtime.renderer.KuitoValue
import dev.kuito.runtime.renderer.views.KuitoImageSource
import dev.kuito.runtime.renderer.views.KuitoImageView
import dev.kuito.runtime.renderer.views.KuitoTintable

/** Image source, fit and loading options; aspectRatio is a layout prop. */
internal object KuitoImageProperties {
    private val modes = mapOf(
        "cover" to ScaleType.CENTER_CROP,
        "contain" to ScaleType.FIT_CENTER,
        "fill" to ScaleType.FIT_XY,
        "none" to ScaleType.CENTER,
    )

    val setters: Map<String, KuitoPropertySetter> = mapOf(
        "src" to { context, value ->
            val view = context.view as? KuitoImageView ?: context.unsupportedProp()
            val source = source(value, context)

            runCatching { view.setSource(source) }.onFailure { context.unsupportedValue(value, it.message.orEmpty()) }
        },
        "objectFit" to option(modes::get) { view, mode -> view.scaleType = mode },
        "placeholderColor" to image { view, value, context -> view.placeholderColor = if (value == KuitoValue.Null) null else context.color(value) },
        "thumbhash" to image { view, value, context ->
            view.setThumbHash(
                if (value == KuitoValue.Null) null
                else KuitoThumbHash.parse(context.text(value)) ?: context.unsupportedValue(value, "expects a base64 ThumbHash"),
            )
        },
        "fadeDuration" to image { view, value, context -> view.transitionDuration = context.number(value).toInt().coerceAtLeast(0) },
        // Image's and Symbol's.
        "tintColor" to { context, value ->
            (context.view as? KuitoTintable ?: context.unsupportedProp()).tint = if (value == KuitoValue.Null) null else context.color(value)
        },
        "cache" to option(CachePolicy::of) { view, policy -> view.cachePolicy = policy },
    )

    /** A URL string, `{ uri, headers? }`, or a bundled image's `{ asset }`. */
    private fun source(value: KuitoValue, context: KuitoPropertyContext): KuitoImageSource? {
        if (value == KuitoValue.Null) return null

        return when (val source = KuitoPropValues.src(context.record(value))) {
            is KuitoImageSourceValue.Url -> KuitoImageSource.Remote(source.value, emptyMap())
            is KuitoImageSourceValue.Bundled -> source.value.asset.takeIf { it.isNotEmpty() }?.let(KuitoImageSource::Bundled)
            is KuitoImageSourceValue.Remote ->
                source.value.uri.takeIf { it.isNotEmpty() }?.let { KuitoImageSource.Remote(it, source.value.headers.orEmpty()) }
        }
    }

    /** An enum prop with a fixed set of values; any other value is unsupported. */
    private fun <T : Any> option(parse: (String) -> T?, apply: (KuitoImageView, T) -> Unit): KuitoPropertySetter =
        { context, value ->
            val view = context.view as? KuitoImageView ?: context.unsupportedProp()

            apply(view, parse(context.keyword(value)) ?: context.unsupportedValue(value, "expects one of its values"))
        }

    private fun image(apply: (KuitoImageView, KuitoValue, KuitoPropertyContext) -> Unit): KuitoPropertySetter = { context, value ->
        apply(context.view as? KuitoImageView ?: context.unsupportedProp(), value, context)
    }
}
