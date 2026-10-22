package dev.kuito.runtime.renderer

import android.graphics.Color
import android.view.View
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.appcompat.widget.SearchView
import androidx.core.view.MenuItemCompat
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.kuito.runtime.renderer.views.KuitoNavigationScreenLayout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * A screen's header slot (docs/navigation.md#headers): its items become the
 * top app bar's actions, its large title Material's large top app bar's, and
 * its search a SearchView action; each reports back as an event of the screen.
 */
@RunWith(AndroidJUnit4::class)
class KuitoNavigationHeaderTest {
    /** Events as `<view>.<event> <layout> <numbers> <strings>`. */
    private val sent = mutableListOf<String>()

    /** An event as its typed record reads: the record is reused, so describe it as it arrives. */
    private fun describe(event: String, record: KuitoEventRecord) =
        "$event ${record.layout} ${record.numbers.take(record.count)} ${record.strings}"

    private fun describe(event: String, payload: KuitoEventPayload) = describe(event, KuitoEventRecord().also(payload::write))

    private fun onScreen(test: (KuitoAndroidRenderer, KuitoNavigationScreenLayout) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val context = instrumentation.targetContext
                val renderer = KuitoAndroidRenderer(context, FrameLayout(context)) { id, event, record ->
                    sent.add("$id." + describe(event, record))
                    false
                }

                renderer.createView(STACK, "NavigationStack", 0, "stack")
                renderer.createView(SCREEN, "NavigationScreen", STACK, "screen")
                renderer.setProperty(SCREEN, "title", KuitoValue.Text("Shows"))
                test(renderer, checkNotNull(renderer.nodes[SCREEN]?.view as? KuitoNavigationScreenLayout))
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    private fun KuitoAndroidRenderer.setItems(vararg items: HeaderItem) = setProperty(SCREEN, "headerItems", headerItems(*items))

    @Test
    fun itemsBecomeActionsLeadingOnesFirst() = onScreen { renderer, screen ->
        renderer.setItems(
            HeaderItem("Add", HeaderIcon.Platforms("plus", "add")),
            HeaderItem("Edit", leading = true),
            HeaderItem("Share", HeaderIcon.Symbol("share"), disabled = true),
        )

        val menu = screen.header.menu
        val items = (0 until menu.size()).map(menu::getItem)

        // Material's top app bar has one leading place, the up arrow: leading items act first.
        assertEquals(listOf("Edit", "Add", "Share"), items.map { it.title.toString() })
        assertEquals(listOf(true, true, false), items.map { it.isEnabled })
        assertNull("a label alone shows as text", items[0].icon)
        assertNotNull(items[1].icon)

        // A symbol is a drawable of its own: it dims through its tint when its item is disabled.
        val tint = checkNotNull(MenuItemCompat.getIconTintList(items[2]))

        assertEquals(255, Color.alpha(tint.getColorForState(intArrayOf(android.R.attr.state_enabled), 0)))
        assertEquals(97, Color.alpha(tint.getColorForState(intArrayOf(), 0)))
    }

    @Test
    fun pressingAnActionReportsItsIndexAmongAllItems() = onScreen { renderer, screen ->
        renderer.setItems(HeaderItem("Add"), HeaderItem("Edit", leading = true))

        val add = screen.header.menu.getItem(1)

        screen.header.menu.performIdentifierAction(add.itemId, 0)

        assertEquals(listOf("$SCREEN." + describe("headeritem", KuitoIndexPayload(0.0))), sent)
    }

    @Test
    fun noItemsClearsTheBar() = onScreen { renderer, screen ->
        renderer.setItems(HeaderItem("Add"))
        renderer.setProperty(SCREEN, "headerItems", KuitoValue.Null)

        assertEquals(0, screen.header.menu.size())
    }

    @Test
    fun aValueThatIsNotStructuredIsRejected() = onScreen { renderer, _ ->
        // A placement or a label C++ checks against the schema: only structured values reach here.
        assertThrows(KuitoRenderError.UnsupportedValue::class.java) { renderer.setProperty(SCREEN, "headerItems", KuitoValue.Text("Add")) }
    }

    @Test
    fun aLargeTitleShowsUnderTheBar() = onScreen { renderer, screen ->
        assertEquals(View.GONE, screen.largeTitle.visibility)

        renderer.setProperty(SCREEN, "largeTitle", KuitoValue.Bool(true))

        assertEquals(View.VISIBLE, screen.largeTitle.visibility)
        assertEquals("Shows", screen.largeTitle.text.toString())
        assertTrue("the bar's own title steps aside", screen.header.title.isNullOrEmpty())

        renderer.setProperty(SCREEN, "largeTitle", KuitoValue.Bool(false))

        assertEquals(View.GONE, screen.largeTitle.visibility)
        assertEquals("Shows", screen.header.title.toString())
    }

    @Test
    fun searchIsASearchViewThatReportsItsText() = onScreen { renderer, screen ->
        renderer.setProperty(SCREEN, "search", headerSearch("Shows"))

        val menu = screen.header.menu
        val search = (0 until menu.size()).map(menu::getItem).firstNotNullOf { it.actionView as? SearchView }

        assertEquals("Shows", search.queryHint.toString())

        search.setQuery("bear", false)
        search.setQuery("bear", true)

        assertEquals(
            listOf("$SCREEN." + describe("search", KuitoTextPayload("bear")), "$SCREEN." + describe("searchsubmit", KuitoTextPayload("bear"))),
            sent,
        )

        renderer.setProperty(SCREEN, "search", KuitoValue.Null)

        assertFalse((0 until menu.size()).any { menu.getItem(it).actionView is SearchView })
    }

    @Test
    fun aNewPlaceholderNamesTheSearchActionToo() = onScreen { renderer, screen ->
        renderer.setProperty(SCREEN, "search", headerSearch("Shows"))
        renderer.setProperty(SCREEN, "search", headerSearch("Films"))

        val menu = screen.header.menu
        val item = (0 until menu.size()).map(menu::getItem).first { it.actionView is SearchView }

        assertEquals("Films", item.title.toString())
        assertEquals("Films", (item.actionView as SearchView).queryHint.toString())
    }

    @Test
    fun backClosesAnOpenSearchBeforeItPopsTheScreen() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()

        ActivityScenario.launch(ComponentActivity::class.java).use { scenario ->
            lateinit var renderer: KuitoAndroidRenderer

            scenario.onActivity { activity ->
                val container = FrameLayout(activity)

                activity.setContentView(container)
                renderer = KuitoAndroidRenderer(activity, container) { id, event, _ ->
                    sent.add("$id.$event")
                    false
                }
                renderer.createView(STACK, "NavigationStack", 0, "stack")
                renderer.createView(SCREEN, "NavigationScreen", STACK, "first")
                renderer.createView(SCREEN + 1, "NavigationScreen", STACK, "second")
                renderer.setProperty(SCREEN + 1, "search", headerSearch("Shows"))
            }
            instrumentation.waitForIdleSync()

            scenario.onActivity { activity ->
                val screen = checkNotNull(renderer.nodes[SCREEN + 1]?.view as? KuitoNavigationScreenLayout)
                val menu = screen.header.menu
                val search = (0 until menu.size()).map(menu::getItem).first { it.actionView is SearchView }

                assertTrue(search.expandActionView())

                activity.onBackPressedDispatcher.onBackPressed()

                assertFalse("back closed the search", search.isActionViewExpanded)
                assertEquals(emptyList<String>(), sent.filter { it.endsWith(".dismiss") })

                activity.onBackPressedDispatcher.onBackPressed()

                assertEquals(listOf("${SCREEN + 1}.dismiss"), sent.filter { it.endsWith(".dismiss") })
            }
        }
    }
}

private const val STACK = 1
private const val SCREEN = 2
