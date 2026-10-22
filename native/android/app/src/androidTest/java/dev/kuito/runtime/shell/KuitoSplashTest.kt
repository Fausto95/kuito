package dev.kuito.runtime.shell

import android.view.View
import android.widget.FrameLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.kuito.runtime.renderer.KuitoAndroidRenderer
import dev.kuito.runtime.renderer.KuitoValue
import dev.kuito.runtime.renderer.setDrivenProperty
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The launch screen stays until the app's first frame with content: the
 * first batch in which the renderer creates a view, which the shell hears as
 * the renderer's `onUpdate` (docs/splash.md#until-the-app-is-ready). Every
 * shell keeps it, Splash module or not.
 */
@RunWith(AndroidJUnit4::class)
class KuitoSplashTest {
    private class Shell(val root: FrameLayout, val overlay: View, val renderer: KuitoAndroidRenderer)

    private fun onShell(test: (Shell) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val context = instrumentation.targetContext
                val root = FrameLayout(context)
                val surface = FrameLayout(context)
                val overlay = View(context)

                root.addView(surface)
                KuitoSplash.attach(overlay, root) { false }

                val renderer = KuitoAndroidRenderer(context, surface) { _, _, _ -> false }
                var hasFirstFrame = false

                // As the shell wires it: the first update is the first frame with content.
                renderer.onUpdate = {
                    if (!hasFirstFrame) {
                        hasFirstFrame = true
                        KuitoSplash.firstFrame()
                    }
                }
                test(Shell(root, overlay, renderer))
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    @After
    fun dismiss() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(KuitoSplash::dismiss)
    }

    @Test
    fun aFrameWithNoViewKeepsIt() = onShell { shell ->
        KuitoSplash.framesCommitted()

        assertTrue(KuitoSplash.isVisible)
        assertSame(shell.root, shell.overlay.parent)
    }

    @Test
    fun theFirstViewTheAppRendersHidesIt() = onShell { shell ->
        shell.renderer.createView(1, "Box", 0, "screen")

        assertFalse(KuitoSplash.isVisible)
        assertNull(shell.overlay.parent)
    }

    @Test
    fun aKeptSplashWaitsForHide() = onShell { shell ->
        KuitoSplash.preventAutoHide()
        shell.renderer.createView(1, "Box", 0, "screen")

        assertTrue(KuitoSplash.isVisible)

        var hidden = false

        KuitoSplash.hide(false) { hidden = true }

        assertTrue(hidden)
        assertNull(shell.overlay.parent)
    }

    @Test
    fun uiThreadMotionIsNoContent() = onShell { shell ->
        KuitoSplash.preventAutoHide()
        shell.renderer.createView(1, "Box", 0, "screen")

        var updates = 0

        shell.renderer.onUpdate = { updates++ }
        shell.renderer.setDrivenProperty(1, "opacity", KuitoValue.Number(0.5))

        assertEquals(0, updates)
    }
}
