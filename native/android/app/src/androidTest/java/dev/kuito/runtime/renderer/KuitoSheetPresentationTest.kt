package dev.kuito.runtime.renderer

import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.findViewTreeOnBackPressedDispatcherOwner
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import dev.kuito.runtime.renderer.views.KuitoNavigationScreenLayout
import dev.kuito.runtime.renderer.views.KuitoSheetLayout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * A Sheet's presentation picks the platform's surface: Material's bottom
 * sheet, or a full-screen dialog for a modal or full-screen route, whose
 * NavigationStack takes back before the dialog does (docs/navigation.md).
 */
@RunWith(AndroidJUnit4::class)
class KuitoSheetPresentationTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private lateinit var scenario: ActivityScenario<ComponentActivity>
    private lateinit var activity: ComponentActivity
    private lateinit var renderer: KuitoAndroidRenderer

    /** Events as `<view>.<event>`, written and read on the main thread. */
    private val events = mutableListOf<String>()

    @Before
    fun setUp() {
        scenario = ActivityScenario.launch(ComponentActivity::class.java)
        scenario.onActivity { activity ->
            val container = FrameLayout(activity)

            activity.setContentView(container)
            this.activity = activity
            renderer = KuitoAndroidRenderer(activity, container) { id, event, _ ->
                events += "$id.$event"
                false
            }
            renderer.createView(BOX, "Box", 0, "box")
            renderer.createView(SHEET, "Sheet", BOX, "sheet")
        }
    }

    @After
    fun tearDown() = scenario.close()

    private fun <T> onMain(block: () -> T): T {
        var result: Result<T>? = null

        instrumentation.runOnMainSync { result = runCatching(block) }

        return checkNotNull(result).getOrThrow()
    }

    private fun waitUntil(what: String, condition: () -> Boolean) {
        val deadline = SystemClock.uptimeMillis() + 5_000

        while (!onMain(condition)) {
            check(SystemClock.uptimeMillis() < deadline) { "timed out waiting until $what" }
            SystemClock.sleep(10)
        }
    }

    private val sheet get() = checkNotNull(renderer.nodes[SHEET]?.view as? KuitoSheetLayout)

    /** A modal holding a stack of [screens] screens, open. */
    private fun openModal(presentation: Pair<Int, String> = 1 to "modal", screens: Int = 1) = onMain {
        renderer.setProperty(SHEET, "presentation", KuitoValue.Enum(presentation.first, presentation.second))
        renderer.createView(STACK, "NavigationStack", SHEET, "stack")
        repeat(screens) { index -> renderer.createView(SCREEN + index, "NavigationScreen", STACK, "screen-$index") }
        renderer.setProperty(SHEET, "open", KuitoValue.Bool(true))
    }

    private fun back() = onMain { checkNotNull(sheet.findViewTreeOnBackPressedDispatcherOwner()).onBackPressedDispatcher.onBackPressed() }

    @Test
    fun aSheetIsMaterialsBottomSheet() = onMain {
        assertTrue(sheet.makeDialog() is BottomSheetDialog)
    }

    /** A sheet at `72%` and `100%`, as Reel's details route, holding content that grows around more that grows; open. */
    private fun openTwoSnapPoints() {
        onMain {
            // Two `named` snap points (variant 1), as a sheet route's `snapPoints: ['72%', '100%']`.
            renderer.setProperty(SHEET, "snapPoints", struct { list(listOf("72%", "100%")) { number(1); string(it) } })
            renderer.createView(CONTENT, "Box", SHEET, "content")
            renderer.setProperty(CONTENT, "flexGrow", KuitoValue.Number(1.0))
            renderer.createView(INNER, "Box", CONTENT, "inner")
            renderer.setProperty(INNER, "flexGrow", KuitoValue.Number(1.0))
            renderer.setProperty(SHEET, "open", KuitoValue.Bool(true))
        }
        waitUntil("the sheet is up") { sheet.isAttachedToWindow && sheet.height > 0 }
        instrumentation.waitForIdleSync()
    }

    /** Material's sheet behavior, which moves the surface around the content. */
    private val behavior get() = BottomSheetBehavior.from(checkNotNull(sheet.parent?.parent as? View))

    private val moving = setOf(BottomSheetBehavior.STATE_DRAGGING, BottomSheetBehavior.STATE_SETTLING)

    /** Drags a finger [distance] px down from [y], over half a second, and lifts it. */
    private fun drag(y: Int, distance: Int) {
        val x = onMain { sheet.width / 2f }
        val start = SystemClock.uptimeMillis()
        val steps = 30

        fun send(action: Int, step: Int) {
            val event = MotionEvent.obtain(start, start + step * 16L, action, x, y + distance * step / steps.toFloat(), 0)

            instrumentation.sendPointerSync(event)
            event.recycle()
        }

        send(MotionEvent.ACTION_DOWN, 0)
        for (step in 1..steps) send(MotionEvent.ACTION_MOVE, step)
        send(MotionEvent.ACTION_UP, steps)
    }

    @Test
    fun aSheetDraggedDownFromItsLowestSnapPointRestsThereOrCloses() {
        openTwoSnapPoints()
        waitUntil("the sheet rests at its lowest snap point") { behavior.state == BottomSheetBehavior.STATE_COLLAPSED }

        val (top, screen) = onMain { IntArray(2).also(sheet::getLocationOnScreen)[1] to sheet.rootView.height }

        // A quarter of the screen down, not far enough to close it.
        drag(top + 20, screen / 4)
        waitUntil("the sheet settles") { behavior.state !in moving }

        onMain {
            if ("$SHEET.close" !in events) assertEquals(BottomSheetBehavior.STATE_COLLAPSED, behavior.state)
        }
    }

    @Test
    fun anExpandedSheetRunsUnderTheNavigationBarAndStopsBelowTheStatusBar() {
        openTwoSnapPoints()
        onMain { behavior.state = BottomSheetBehavior.STATE_EXPANDED }
        waitUntil("the sheet is expanded") { behavior.state == BottomSheetBehavior.STATE_EXPANDED }
        instrumentation.waitForIdleSync()

        onMain {
            val content = checkNotNull(renderer.nodes[CONTENT]?.view)
            val inner = checkNotNull(renderer.nodes[INNER]?.view)
            val screen = activity.window.decorView.height
            val bars = checkNotNull(ViewCompat.getRootWindowInsets(sheet)).getInsets(WindowInsetsCompat.Type.systemBars())
            val top = IntArray(2).also(sheet::getLocationOnScreen)[1]
            val bottom = { view: View -> IntArray(2).also(view::getLocationOnScreen)[1] + view.height }

            assertEquals("the sheet's top", bars.top, top)
            // The sheet and its only view, a sheet route's screen, reach the
            // screen's bottom; the content inside stops at the navigation bar.
            assertEquals("the sheet's bottom", screen, top + sheet.height)
            assertEquals("its view's bottom", screen.toFloat(), bottom(content).toFloat(), 1f)
            assertEquals("the content's bottom", (screen - bars.bottom).toFloat(), bottom(inner).toFloat(), 1f)
        }
    }

    /** The sheet's only view takes its inset: its background fills the sheet, its content stays clear of the navigation bar. */
    @Test
    fun contentThatGrowsFillsASheetWithSeveralSnapPoints() {
        openTwoSnapPoints()

        onMain {
            val content = checkNotNull(renderer.nodes[CONTENT]?.view)
            val inner = checkNotNull(renderer.nodes[INNER]?.view)
            val navigationBar = ViewCompat.getRootWindowInsets(sheet)?.getInsets(WindowInsetsCompat.Type.navigationBars())?.bottom ?: 0

            assertTrue("the emulator has a navigation bar", navigationBar > 0)
            // Within a pixel: the layout rounds dp to the screen's pixels.
            assertEquals(sheet.height.toFloat(), content.height.toFloat(), 1f)
            assertEquals((sheet.height - navigationBar).toFloat(), inner.height.toFloat(), 1f)
        }
    }

    @Test
    fun aModalFillsTheWindowAndSlidesUpAsASheetDoes() = assertFillsTheWindow(1 to "modal")

    @Test
    fun aFullScreenRouteFillsTheWindowAndSlidesUpAsASheetDoes() = assertFillsTheWindow(2 to "fullScreen")

    private fun assertFillsTheWindow(presentation: Pair<Int, String>) {
        openModal(presentation)
        waitUntil("it is up") { sheet.isAttachedToWindow && sheet.height > 0 }

        onMain {
            val window = sheet.rootView
            val attributes = window.layoutParams as WindowManager.LayoutParams

            assertEquals(activity.window.decorView.width, window.width)
            assertEquals(activity.window.decorView.height, window.height)
            assertEquals(com.google.android.material.R.style.Animation_Material3_BottomSheetDialog, attributes.windowAnimations)
        }
    }

    @Test
    fun aModalsHeaderSitsBelowTheStatusBar() {
        openModal()
        waitUntil("the modal is laid out") { sheet.isAttachedToWindow && sheet.height > 0 }
        instrumentation.waitForIdleSync()

        onMain {
            val screen = checkNotNull(renderer.nodes[SCREEN]?.view as? KuitoNavigationScreenLayout)
            val statusBar = ViewCompat.getRootWindowInsets(sheet)?.getInsets(WindowInsetsCompat.Type.statusBars())?.top ?: 0
            val position = IntArray(2).also(screen.header::getLocationInWindow)

            assertTrue("the header at ${position[1]} clears the status bar's $statusBar", position[1] >= statusBar)
        }
    }

    @Test
    fun backPopsTheModalsStackThenClosesTheModal() {
        openModal(screens = 2)
        waitUntil("the modal is up") { sheet.isAttachedToWindow && sheet.height > 0 }
        instrumentation.waitForIdleSync()

        back()
        waitUntil("the top screen is popped") { "${SCREEN + 1}.dismiss" in events }
        onMain { assertFalse("$events", "$SHEET.close" in events) }

        instrumentation.waitForIdleSync()
        back()
        waitUntil("the modal closes") { "$SHEET.close" in events }
    }

    @Test
    fun backPopsASheetsStack() {
        openModal(presentation = 0 to "sheet", screens = 2)
        waitUntil("the sheet is up") { sheet.isAttachedToWindow && sheet.height > 0 }
        instrumentation.waitForIdleSync()

        back()
        waitUntil("the top screen is popped") { "${SCREEN + 1}.dismiss" in events }
    }

    @Test
    fun aPresentationOtherThanSheetModalOrFullScreenIsRejected() {
        onMain {
            assertThrows(KuitoRenderError.UnsupportedValue::class.java) {
                renderer.setProperty(SHEET, "presentation", KuitoValue.Enum(3, "popover"))
            }
        }
    }
}

private const val BOX = 1
private const val SHEET = 2
private const val STACK = 3
private const val SCREEN = 4
private const val CONTENT = 10
private const val INNER = 11
