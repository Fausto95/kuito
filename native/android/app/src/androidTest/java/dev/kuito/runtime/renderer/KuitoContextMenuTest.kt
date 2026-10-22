package dev.kuito.runtime.renderer

import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.view.Menu
import android.view.View
import android.widget.FrameLayout
import android.widget.PopupMenu
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.kuito.runtime.link.KuitoModuleView
import dev.kuito.runtime.link.register
import dev.kuito.runtime.modules.contextmenu.KuitoContextMenuView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * ContextMenu (native/modules/context-menu): a view around its children
 * whose long press opens Android's floating context menu of its items. Its
 * `select` carries the value of the item the user picked.
 */
@RunWith(AndroidJUnit4::class)
class KuitoContextMenuTest {
    private val sent = mutableListOf<String>()

    private fun onMenu(test: (KuitoAndroidRenderer, KuitoContextMenuView, FrameLayout) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val container = FrameLayout(instrumentation.targetContext)
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, container) { _, event, record ->
                    sent.add(record.describe(event))
                }

                KuitoModuleView(::KuitoContextMenuView, KuitoContextMenuView::define).register("ContextMenu", listOf("select"))
                renderer.createView(MENU, "module:ContextMenu", 0, "menu")
                renderer.setProperty(MENU, "items", KuitoValue.Json(ITEMS))
                test(renderer, renderer.nodes.getValue(MENU).view as KuitoContextMenuView, container)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    /** The menu a long press fills, as a popup's menu stands in for the window's. */
    private fun KuitoContextMenuView.filled(): Menu = PopupMenu(context, this).menu.also(::fill)

    private fun Menu.titles() = (0 until size()).map { getItem(it).title.toString() }

    @Test
    fun aLongPressOpensAMenuOfItsItems() = onMenu { _, menu, _ ->
        val filled = menu.filled()

        assertTrue(menu.isLongClickable)
        assertEquals(listOf("Share", "Mark played", "Delete"), filled.titles())
        assertEquals(listOf(true, false, true), (0 until filled.size()).map { filled.getItem(it).isEnabled })

        val delete = filled.getItem(2).title as Spanned

        assertEquals("a destructive item is drawn in the error color", 1, delete.getSpans(0, delete.length, ForegroundColorSpan::class.java).size)
    }

    @Test
    fun theUsersPickSendsItsValue() = onMenu { _, menu, _ ->
        val filled = menu.filled()

        filled.performIdentifierAction(filled.getItem(2).itemId, 0)

        assertEquals(listOf("""select {"value":"delete"}"""), sent)
    }

    @Test
    fun disabledOrWithoutItemsItOpensNoMenu() = onMenu { renderer, menu, _ ->
        renderer.setProperty(MENU, "disabled", KuitoValue.Bool(true))
        assertFalse(menu.isLongClickable)
        assertEquals(emptyList<String>(), menu.filled().titles())

        renderer.setProperty(MENU, "disabled", KuitoValue.Null)
        renderer.setProperty(MENU, "items", KuitoValue.Json("[]"))
        assertFalse(menu.isLongClickable)
    }

    @Test
    fun itLaysOutItsChildrenInsideIt() = onMenu { renderer, menu, container ->
        renderer.createView(TITLE, "Text", MENU, "title")
        renderer.setProperty(TITLE, "text", KuitoValue.Text("Episode 4"))
        container.measure(
            View.MeasureSpec.makeMeasureSpec(320, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(640, View.MeasureSpec.EXACTLY),
        )
        container.layout(0, 0, 320, 640)

        val title = checkNotNull(renderer.nodes.getValue(TITLE).view)

        assertSame(menu, title.parent)
        assertTrue("it is as tall as its children", menu.height > 0)
        assertEquals(title.height, menu.height)
    }

    @Test
    fun itemsThatRepeatAValueOrLackALabelAreRejected() = onMenu { renderer, _, _ ->
        for (value in listOf("""[{"value":"a","label":"A"},{"value":"a","label":"B"}]""", """[{"value":"a"}]""", "\"a\"")) {
            val error = assertThrows(value, KuitoRenderError.UnsupportedValue::class.java) {
                renderer.setProperty(MENU, "items", KuitoValue.Json(value))
            }

            assertEquals("items", error.prop)
        }
    }

    private companion object {
        const val MENU = 1
        const val TITLE = 2
        const val ITEMS =
            """[{"value":"share","label":"Share"},{"value":"played","label":"Mark played","disabled":true},{"value":"delete","label":"Delete","destructive":true}]"""
    }
}
