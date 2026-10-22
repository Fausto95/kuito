package dev.kuito.runtime.renderer.views

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.TransitionDrawable
import android.util.Size
import android.widget.ImageView
import dev.kuito.runtime.renderer.images.CachePolicy
import dev.kuito.runtime.renderer.images.KuitoBundledImages
import dev.kuito.runtime.renderer.images.KuitoImageLoader
import dev.kuito.runtime.renderer.images.KuitoLoadedImage
import dev.kuito.runtime.renderer.KuitoErrorPayload
import dev.kuito.runtime.renderer.KuitoEventPayload
import dev.kuito.runtime.renderer.KuitoImageSizePayload
import dev.kuito.runtime.renderer.images.KuitoThumbHash

/**
 * What an Image shows: a URL and the headers its request sends, or an image
 * bundled into the app under this name (docs/assets.md).
 */
internal sealed interface KuitoImageSource {
    data class Remote(val url: String, val headers: Map<String, String>) : KuitoImageSource

    data class Bundled(val name: String) : KuitoImageSource
}

/**
 * React Native's Image for URLs, loaded through KuitoImageLoader, with a
 * placeholder color and ThumbHash preview while loading and an optional
 * cross-fade on arrival,
 * and for bundled images, shown at once. Like React Native's network images
 * a URL has no intrinsic size: the kernel sizes a bundled image from the
 * size the compiler read (src/runtime/intrinsic-size.ts).
 */
@SuppressLint("ViewConstructor", "AppCompatCustomView")
internal class KuitoImageView(
    context: Context,
    /** Emits loadstart, load ({ width, height } in pixels), error and loadend. */
    private val emit: (String, KuitoEventPayload?) -> Unit,
) : ImageView(context), KuitoTintable {
    var transitionDuration = 0
    var cachePolicy = CachePolicy.MemoryDisk

    var placeholderColor: Int? = null
        set(value) {
            field = value

            if (!loaded) swap(placeholder())
        }

    /** The ThumbHash's preview once decoded; the drawable scales it as it will the image. */
    var preview: Bitmap? = null
        private set

    private var thumbHash: KuitoThumbHash? = null

    override var tint: Int? = null
        set(value) {
            field = value
            imageTintList = value?.let(ColorStateList::valueOf)
        }

    var source: KuitoImageSource? = null
        private set
    private var loaded = false

    /** The decode on screen, which a larger size replaces. */
    private var decoded: KuitoLoadedImage? = null
    /** The load whose callback counts; null before a source's first. */
    private var request: Any? = null
    private var loading = false
    private var swapping = false

    init {
        scaleType = ScaleType.CENTER_CROP
        clipToOutline = true
    }

    /** Shows the hash's preview over the placeholder color once it is decoded, off the main thread; null drops it. */
    fun setThumbHash(next: KuitoThumbHash?) {
        thumbHash = next
        showPreview(null)

        next ?: return

        KuitoImageLoader.preview(next) { bitmap -> if (thumbHash === next) showPreview(bitmap) }
    }

    private fun showPreview(bitmap: Bitmap?) {
        preview = bitmap

        if (!loaded) swap(placeholder())
    }

    /** Throws for a bundled image the app was built without. */
    fun setSource(next: KuitoImageSource?) {
        if (next == source) return

        if (next is KuitoImageSource.Bundled) return showBundled(next)

        source = next
        loaded = false
        decoded = null
        request = null
        loading = false
        swap(placeholder())

        if (next !is KuitoImageSource.Remote) return

        emit("loadstart", null)

        // A new view has no size until the layout pass that follows the props.
        if (isLaidOut) load() else requestLayout()
    }

    /** Loads once the view has its size, and again, keeping the image shown, when it grows past what the decode covers. */
    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        super.onLayout(changed, left, top, right, bottom)

        if (source !is KuitoImageSource.Remote) return

        if (request == null || !loading && outgrown()) load()
    }

    /** The view's size in pixels; null, the full image, for `none`, which shows the image at its own size, and before the view has a size. */
    private fun target(): Size? = if (scaleType == ScaleType.CENTER || width <= 0 || height <= 0) null else Size(width, height)

    /** The view grew past the decode on screen. One with no size shows nothing, so it keeps the decode it has. */
    private fun outgrown(): Boolean {
        val shown = decoded ?: return false

        if (scaleType != ScaleType.CENTER && (width <= 0 || height <= 0)) return false

        return !shown.covers(target())
    }

    /** The first load of a source emits its events; a reload for a larger size replaces the bitmap without them. */
    private fun load() {
        val current = source as? KuitoImageSource.Remote ?: return
        val first = decoded == null
        // Its own identity: a source set again equals the one before, whose callbacks must not count.
        val token = Any()

        request = token
        loading = true
        KuitoImageLoader.load(context, current.url, current.headers, cachePolicy, target()) { result ->
            if (token !== request) return@load

            loading = false
            result
                .onSuccess { image ->
                    decoded = image

                    if (first) {
                        show(image.bitmap)
                        loaded(image.width, image.height)
                    } else {
                        swap(BitmapDrawable(resources, image.bitmap))
                    }
                }
                .onFailure { error -> if (first) emit("error", KuitoErrorPayload(error.message ?: error.toString())) }

            if (first) emit("loadend", null)

            // The view grew while it loaded.
            if (result.isSuccess && outgrown()) load()
        }
    }

    /** Shown in the same frame, with no placeholder; the load events follow as a URL's do. */
    private fun showBundled(next: KuitoImageSource.Bundled) {
        val image = KuitoBundledImages.drawable(context, next.name)

        source = next
        loaded = true
        swap(image)

        post {
            if (next != source) return@post

            emit("loadstart", null)
            loaded(image.intrinsicWidth, image.intrinsicHeight)
            emit("loadend", null)
        }
    }

    /** The image's size in pixels. */
    private fun loaded(width: Int, height: Int) = emit("load", KuitoImageSizePayload(width.toDouble(), height.toDouble()))

    /** The preview, fitted by scaleType as the image will be; the color alone fills the view. */
    private fun placeholder(): Drawable? =
        preview?.let { BitmapDrawable(resources, it) } ?: placeholderColor?.let(::ColorDrawable)

    /** The color under a preview fills the view whatever scaleType does to the preview. */
    override fun onDraw(canvas: Canvas) {
        if (!loaded && preview != null) placeholderColor?.let(canvas::drawColor)
        super.onDraw(canvas)
    }

    private fun show(bitmap: Bitmap) {
        val image = BitmapDrawable(resources, bitmap)
        val from = placeholder()

        loaded = true

        if (transitionDuration <= 0 || from == null) return swap(image)

        val fade = TransitionDrawable(arrayOf(from, image)).apply { isCrossFadeEnabled = true }

        swap(fade)
        fade.startTransition(transitionDuration)
    }

    /**
     * The layout engine sizes the view, never the drawable, so a new
     * drawable needs a redraw and not the layout pass ImageView requests
     * when its intrinsic size changes. ImageView fits the drawable itself.
     */
    private fun swap(drawable: Drawable?) {
        swapping = true
        setImageDrawable(drawable)
        swapping = false
    }

    override fun requestLayout() {
        if (!swapping) super.requestLayout()
    }
}
