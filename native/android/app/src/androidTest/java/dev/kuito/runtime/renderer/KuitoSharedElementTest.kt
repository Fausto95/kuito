package dev.kuito.runtime.renderer

import android.view.View
import android.widget.FrameLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Views with a sharedId, as a navigation stack asks for them on each screen
 * it transitions between (docs/navigation.md#shared-elements).
 */
@RunWith(AndroidJUnit4::class)
class KuitoSharedElementTest {
    private fun onRenderer(test: (KuitoAndroidRenderer, FrameLayout) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val container = FrameLayout(instrumentation.targetContext)
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, container) { _, _, _ -> false }

                renderer.createView(1, "Box", 0, "poster")
                renderer.createView(2, "VStack", 0, "row")
                renderer.createView(3, "Box", 2, "title")
                renderer.createView(4, "Box", 2, "plain")
                renderer.setProperty(1, "sharedId", KuitoValue.Text("poster-7"))
                renderer.setProperty(3, "sharedId", KuitoValue.Text("title-7"))
                test(renderer, container)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    @Test
    fun findsEachSharedViewInsideARoot() = onRenderer { renderer, container ->
        val shared = renderer.sharedElements(container)

        assertEquals(setOf("poster-7", "title-7"), shared.keys)
        assertEquals(1, shared["poster-7"]?.let(renderer::idContaining))
        assertEquals(3, shared["title-7"]?.let(renderer::idContaining))
    }

    @Test
    fun aClearedSharedIdIsNoLongerShared() = onRenderer { renderer, container ->
        renderer.setProperty(1, "sharedId", KuitoValue.Null)

        assertEquals(setOf("title-7"), renderer.sharedElements(container).keys)
    }

    @Test
    fun onlyViewsInsideTheRootAreShared() = onRenderer { renderer, container ->
        val row = renderer.sharedElements(container)["title-7"]?.parent as View

        assertEquals(setOf("title-7"), renderer.sharedElements(row).keys)
    }
}
