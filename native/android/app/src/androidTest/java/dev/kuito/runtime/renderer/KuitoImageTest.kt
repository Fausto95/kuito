package dev.kuito.runtime.renderer

import android.graphics.Bitmap
import android.graphics.drawable.BitmapDrawable
import android.util.Size
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.kuito.runtime.renderer.images.CachePolicy
import dev.kuito.runtime.renderer.images.KuitoImageLoader
import dev.kuito.runtime.renderer.images.KuitoLoadedImage
import dev.kuito.runtime.renderer.views.KuitoImageSource
import dev.kuito.runtime.renderer.views.KuitoImageView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Image's `src` and loader: what each source asks the network for, and what a load reports. Only local files load. */
@RunWith(AndroidJUnit4::class)
class KuitoImageTest {
    private fun onRenderer(test: (KuitoAndroidRenderer, ViewGroup) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val container = FrameLayout(instrumentation.targetContext)
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, container) { _, _, _ -> false }

                renderer.createView(IMAGE, "Image", 0, "image")
                test(renderer, container)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    private fun tree(view: View): Sequence<View> = sequenceOf(view) +
        ((view as? ViewGroup)?.let { group -> (0 until group.childCount).asSequence().flatMap { tree(group.getChildAt(it)) } } ?: emptySequence())

    private fun imageIn(container: ViewGroup) =
        requireNotNull(tree(container).filterIsInstance<KuitoImageView>().firstOrNull()) { "No KuitoImageView in the tree" }

    @Test
    fun aRemoteSourceKeepsItsHeaders() = onRenderer { renderer, container ->
        renderer.setProperty(IMAGE, "src", remoteImage("https://example.com/a.png", mapOf("Authorization" to "Bearer t")))

        assertEquals(
            KuitoImageSource.Remote("https://example.com/a.png", mapOf("Authorization" to "Bearer t")),
            imageIn(container).source,
        )
    }

    @Test
    fun aUrlStringHasNoHeaders() = onRenderer { renderer, container ->
        renderer.setProperty(IMAGE, "src", imageUrl("https://example.com/a.png"))

        assertEquals(KuitoImageSource.Remote("https://example.com/a.png", emptyMap()), imageIn(container).source)
    }

    @Test
    fun aSourceThatIsNotStructuredIsUnsupported() = onRenderer { renderer, _ ->
        val error = assertThrows(KuitoRenderError.UnsupportedValue::class.java) {
            renderer.setProperty(IMAGE, "src", KuitoValue.Text("https://example.com/a.png"))
        }

        assertEquals("src", error.prop)
    }

    @Test
    fun theRequestCarriesTheHeaders() {
        val request = KuitoImageLoader.request("https://example.com/a.png", mapOf("Authorization" to "Bearer t", "Accept" to "image/webp"))

        assertEquals("https://example.com/a.png", request.url.toString())
        assertEquals("Bearer t", request.header("Authorization"))
        assertEquals("image/webp", request.header("Accept"))
    }

    /** What image.prefetch resolves: the loaded bitmap's size in pixels. */
    @Test
    fun aLoadedImageReportsItsSizeInPixels() = withPng(3, 2) { file ->
        val loaded = load(file, CachePolicy.None, null).getOrThrow()

        assertEquals(3 to 2, loaded.width to loaded.height)
    }

    /** A 2000-pixel photo in a 100 dp square decodes to at most twice the square's pixels across. */
    @Test
    fun anImageDecodesAtTheSizeItIsShown() = withPng(2000, 2000) { file ->
        var view: KuitoImageView? = null

        onRenderer { renderer, container ->
            renderer.setProperty(IMAGE, "width", KuitoValue.Number(100.0))
            renderer.setProperty(IMAGE, "height", KuitoValue.Number(100.0))
            renderer.setProperty(IMAGE, "src", imageUrl(file.toURI().toString()))
            container.layOut()
            view = imageIn(container)
        }

        val pixels = 100 * InstrumentationRegistry.getInstrumentation().targetContext.resources.displayMetrics.density
        val shown = requireNotNull(shownBitmap(requireNotNull(view))) { "the image loads" }

        assertTrue("${shown.width} covers $pixels", shown.width >= pixels)
        assertTrue("${shown.width} is at most twice $pixels", shown.width <= 2 * pixels)
    }

    /** The decoded bitmap is smaller, but `load` and image.prefetch report the photo's own size. */
    @Test
    fun anImageDecodedSmallerReportsItsOwnSize() = withPng(2000, 1000) { file ->
        val loaded = load(file, CachePolicy.None, Size(200, 100)).getOrThrow()

        assertTrue("decoded at ${loaded.bitmap.width}", loaded.bitmap.width < 2000)
        assertEquals(2000 to 1000, loaded.width to loaded.height)
    }

    /** The file is gone before the second request: only the memory cache can serve it. */
    @Test
    fun aSmallerSizeIsServedByTheLargerDecodedImage() = withPng(2000, 2000) { file ->
        val large = load(file, CachePolicy.Memory, Size(600, 600)).getOrThrow()

        file.delete()

        val small = load(file, CachePolicy.Memory, Size(300, 300)).getOrThrow()

        assertSame(large.bitmap, small.bitmap)
    }

    /** Prefetching keeps the bytes and reads the size from the header; the decode waits for an Image. */
    @Test
    fun aPrefetchReportsTheSizeInPixels() = withPng(30, 20) { file ->
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val done = CountDownLatch(1)
        var result: Result<Size>? = null

        instrumentation.runOnMainSync {
            KuitoImageLoader.prefetch(instrumentation.targetContext, file.toURI().toString(), emptyMap(), CachePolicy.MemoryDisk) {
                result = it
                done.countDown()
            }
        }

        assertTrue("the prefetch resolves", done.await(5, TimeUnit.SECONDS))
        assertEquals(Size(30, 20), requireNotNull(result).getOrThrow())
    }

    private fun withPng(width: Int, height: Int, test: (File) -> Unit) {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.cacheDir, "kuito-image-${System.nanoTime()}.png")

        file.outputStream().use { Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).compress(Bitmap.CompressFormat.PNG, 100, it) }

        try {
            test(file)
        } finally {
            file.delete()
        }
    }

    private fun load(file: File, policy: CachePolicy, target: Size?): Result<KuitoLoadedImage> {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val done = CountDownLatch(1)
        var result: Result<KuitoLoadedImage>? = null

        instrumentation.runOnMainSync {
            KuitoImageLoader.load(instrumentation.targetContext, file.toURI().toString(), emptyMap(), policy, target) {
                result = it
                done.countDown()
            }
        }

        assertTrue("the image loads", done.await(5, TimeUnit.SECONDS))

        return requireNotNull(result)
    }

    private fun ViewGroup.layOut() {
        val density = resources.displayMetrics.density

        measure(
            View.MeasureSpec.makeMeasureSpec((320 * density).toInt(), View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec((640 * density).toInt(), View.MeasureSpec.EXACTLY),
        )
        layout(0, 0, (320 * density).toInt(), (640 * density).toInt())
    }

    /** The view's bitmap once it loads, or null after 5 s. */
    private fun shownBitmap(view: KuitoImageView): Bitmap? {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val deadline = System.nanoTime() + 5_000_000_000
        var shown: Bitmap? = null

        while (shown == null && System.nanoTime() < deadline) {
            instrumentation.waitForIdleSync()
            instrumentation.runOnMainSync { shown = (view.drawable as? BitmapDrawable)?.bitmap?.takeIf { view.preview !== it } }
        }

        return shown
    }

    /** The preview is decoded off the main thread, then shown under the image. */
    @Test
    fun aThumbHashShowsItsPreviewWhileLoading() {
        var view: KuitoImageView? = null

        onRenderer { renderer, container ->
            renderer.setProperty(IMAGE, "thumbhash", KuitoValue.Text(LANDSCAPE))
            view = imageIn(container)
        }

        assertEquals(32 to 23, shownPreview(requireNotNull(view))?.let { it.width to it.height })
    }

    @Test
    fun clearingTheThumbHashDropsItsPreview() {
        var renderer: KuitoAndroidRenderer? = null
        var view: KuitoImageView? = null

        onRenderer { created, container ->
            created.setProperty(IMAGE, "thumbhash", KuitoValue.Text(LANDSCAPE))
            renderer = created
            view = imageIn(container)
        }
        shownPreview(requireNotNull(view))

        var preview: Bitmap? = null

        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            requireNotNull(renderer).setProperty(IMAGE, "thumbhash", KuitoValue.Null)
            preview = view?.preview
        }

        assertEquals(null, preview)
    }

    /** The view's preview once it is decoded, or null after 5 s. */
    private fun shownPreview(view: KuitoImageView): Bitmap? {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val deadline = System.nanoTime() + 5_000_000_000
        var preview: Bitmap? = null

        while (preview == null && System.nanoTime() < deadline) {
            instrumentation.waitForIdleSync()
            instrumentation.runOnMainSync { preview = view.preview }
        }

        return preview
    }

    @Test
    fun textThatIsNotAThumbHashIsUnsupported() = onRenderer { renderer, _ ->
        val error = assertThrows(KuitoRenderError.UnsupportedValue::class.java) {
            renderer.setProperty(IMAGE, "thumbhash", KuitoValue.Text("not a hash"))
        }

        assertEquals("thumbhash", error.prop)
    }

    private companion object {
        const val IMAGE = 1

        /** A 3:2 image's ThumbHash: a 32 × 23 preview. */
        const val LANDSCAPE = "4AcKNZqAh4dwd3d4eHh3h3CAB/eI"
    }
}
