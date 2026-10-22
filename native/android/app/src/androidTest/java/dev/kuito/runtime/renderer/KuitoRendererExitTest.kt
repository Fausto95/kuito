package dev.kuito.runtime.renderer

import android.view.View
import android.widget.FrameLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith

/**
 * A view with `exit` leaves Kuito's tree when removed but stays on screen,
 * taking the props the UI thread animates it out with, until it says `exited`.
 */
@RunWith(AndroidJUnit4::class)
class KuitoRendererExitTest {
    private fun onRenderer(test: (KuitoAndroidRenderer, View) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, FrameLayout(instrumentation.targetContext)) { _, _, _ -> false }

                renderer.createView(BOX, "Box", 0, "box")
                renderer.createView(CARD, "Box", BOX, "card")
                test(renderer, checkNotNull(checkNotNull(renderer.nodes[CARD]).layout.view))
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    @Test
    fun aViewWithoutExitGoesAtOnce() = onRenderer { renderer, card ->
        renderer.removeView(CARD)

        assertNull(card.parent)
    }

    @Test
    fun anExitingViewStaysUntilExited() = onRenderer { renderer, card ->
        renderer.setProperty(CARD, "exit", KuitoValue.Bool(true))
        renderer.removeView(CARD)

        assertNotNull("it stays on screen", card.parent)
        assertFalse("but takes no touches", card.isEnabled)

        renderer.setDrivenProperty(CARD, "opacity", KuitoValue.Number(0.5))
        assertEquals("the UI thread animates it out", 0.5f, card.alpha, 0.001f)

        assertNotNull("its record says it is leaving", renderer.nodes[CARD]?.exiting)
        assertThrows("it is out of the tree", KuitoRenderError.MissingView::class.java) { renderer.moveView(CARD, BOX, 0) }

        renderer.setDrivenProperty(CARD, "exited", KuitoValue.Bool(true))
        assertNull("then it goes", card.parent)
        assertNull("with its record", renderer.nodes[CARD])
        assertThrows(KuitoRenderError.MissingView::class.java) {
            renderer.setDrivenProperty(CARD, "opacity", KuitoValue.Number(0.0))
        }
    }

    @Test
    fun clearingDropsAnExitingView() = onRenderer { renderer, card ->
        renderer.setProperty(CARD, "exit", KuitoValue.Bool(true))
        renderer.removeView(CARD)
        renderer.clear()

        assertNull(card.parent)
    }

    private companion object {
        const val BOX = 1
        const val CARD = 2
    }
}
