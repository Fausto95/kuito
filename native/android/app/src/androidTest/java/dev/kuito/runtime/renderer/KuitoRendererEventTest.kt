package dev.kuito.runtime.renderer

import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.EditText
import android.widget.Switch
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.kuito.runtime.modules.KuitoViewEvents
import dev.kuito.runtime.modules.slider.KuitoSliderView
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * A cleared tree is gone for JavaScript: a reload starts a runtime whose view
 * ids repeat the old tree's, so an event from an old view, such as an image
 * load that finishes late, would reach a handler that was never registered.
 */
@RunWith(AndroidJUnit4::class)
class KuitoRendererEventTest {
    /** Each event's view and name; payloads are KuitoEventEmitterTest's concern. */
    private val sent = mutableListOf<String>()

    private fun onRenderer(test: (KuitoAndroidRenderer, ViewGroup) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val container = FrameLayout(instrumentation.targetContext)
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, container) { id, event, _ ->
                    sent.add("$id.$event")
                    false
                }

                renderer.createView(BOX, "Box", 0, "box")
                renderer.createView(TOGGLE, "Toggle", BOX, "toggle")
                test(renderer, container)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    private fun tree(view: View): Sequence<View> = sequenceOf(view) +
        ((view as? ViewGroup)?.let { group -> (0 until group.childCount).asSequence().flatMap { tree(group.getChildAt(it)) } } ?: emptySequence())

    private inline fun <reified T : View> find(view: View): T? = tree(view).filterIsInstance<T>().firstOrNull()

    private fun toggleIn(container: ViewGroup) = requireNotNull(find<Switch>(container)) { "No Switch in the tree" }

    @Test
    fun aViewSendsItsEvents() = onRenderer { _, container ->
        toggleIn(container).isChecked = true

        assertEquals(listOf("$TOGGLE.change"), sent)
    }

    @Test
    fun aClearedControlSendsNothing() = onRenderer { renderer, container ->
        val toggle = toggleIn(container)

        renderer.clear()
        toggle.isChecked = true

        assertEquals(emptyList<String>(), sent)
    }

    @Test
    fun theNextTreeSendsItsEvents() = onRenderer { renderer, container ->
        renderer.clear()
        renderer.createView(TOGGLE, "Toggle", 0, "toggle")
        toggleIn(container).isChecked = true

        assertEquals(listOf("$TOGGLE.change"), sent)
    }

    /*
     * A batch's props are not the user's input: an event they fired would
     * echo the app's own write back as a change, and the main thread would
     * wait for that job while it applies the batch (docs/native-scheduling.md#input).
     */

    @Test
    fun aBatchSetTextSendsNoChange() = onRenderer { renderer, container ->
        renderer.createView(FIELD, "TextField", BOX, "field")
        renderer.setProperty(FIELD, "text", KuitoValue.Text("Hello"))

        assertEquals(emptyList<String>(), sent.filter { it == "$FIELD.change" })

        requireNotNull(find<EditText>(container)).append("!")

        assertEquals(listOf("$FIELD.change"), sent.filter { it == "$FIELD.change" })
    }

    @Test
    fun aBatchSetCheckedSendsNoChange() = onRenderer { renderer, container ->
        renderer.setProperty(TOGGLE, "checked", KuitoValue.Bool(true))

        assertEquals(emptyList<String>(), sent)

        toggleIn(container).isChecked = false

        assertEquals(listOf("$TOGGLE.change"), sent)
    }

    @Test
    fun aModuleSliderSetValueSendsNoChange() = onRenderer { _, container ->
        val events = KuitoEventEmitter { id, event, _ ->
            sent.add("$id.$event")
            false
        }
        val slider = KuitoSliderView(container.context, KuitoViewEvents(SLIDER, events, setOf("change", "changeEnd")))

        slider.value = 0.5
        slider.maximum = 2.0

        assertEquals(emptyList<String>(), sent)
    }
}

private const val BOX = 1
private const val TOGGLE = 2
private const val FIELD = 3
private const val SLIDER = 4
