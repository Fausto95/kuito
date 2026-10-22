package dev.kuito.runtime.renderer

import android.widget.FrameLayout
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.kuito.runtime.renderer.KuitoKeyEdit.Op.INSERT
import dev.kuito.runtime.renderer.properties.KuitoProperties
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import dev.kuito.runtime.renderer.styling.KuitoParses
import org.junit.Test
import org.junit.runner.RunWith

/**
 * A value a prop does not accept is an error the renderer reports, never a
 * silent fallback to the prop's default (CLAUDE.md, Native code).
 */
@RunWith(AndroidJUnit4::class)
class KuitoRendererPropertyTest {
    private fun onRenderer(test: (KuitoAndroidRenderer) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        var failure: Throwable? = null

        instrumentation.runOnMainSync {
            try {
                val renderer = KuitoAndroidRenderer(instrumentation.targetContext, FrameLayout(instrumentation.targetContext)) { _, _, _ -> false }

                renderer.createView(BOX, "Box", 0, "box")
                renderer.createView(IMAGE, "Image", BOX, "image")
                test(renderer)
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    private fun assertUnsupportedValue(id: Int, name: String, value: KuitoValue) = onRenderer { renderer ->
        val error = assertThrows("$name: $value", KuitoRenderError.UnsupportedValue::class.java) {
            renderer.setProperty(id, name, value)
        }

        assertEquals(name, error.prop)
    }

    @Test
    fun aSnapPointThatIsNoHeightPercentageOrContentIsUnsupported() = onRenderer { renderer ->
        renderer.createView(SHEET, "Sheet", BOX, "sheet")

        // One `named` snap point (variant 1), "half": as C++ lays out what it checked.
        val half = struct { list(listOf("half")) { number(1); string(it) } }
        val error = assertThrows(KuitoRenderError.UnsupportedValue::class.java) {
            renderer.setProperty(SHEET, "snapPoints", half)
        }

        assertEquals("snapPoints", error.prop)
    }

    @Test
    fun aScrollViewRefusesARequestByKey() = onRenderer { renderer ->
        renderer.createView(SCROLL, "Scroll", BOX, "scroll")

        // A `key` request (variant 0): only a List has keys.
        val byKey = struct {
            number(0)
            string("row-1")
            optional<Boolean>(null) { flag(it) }
            optional<Number>(null) { number(it) }
            optional<Number>(null) { number(it) }
            number(1)
        }
        val error = assertThrows(KuitoRenderError.UnsupportedValue::class.java) {
            renderer.setProperty(SCROLL, "scrollTo", byKey)
        }

        assertEquals("scrollTo", error.prop)
    }

    @Test
    fun acceptsTheDocumentedValues() = onRenderer { renderer ->
        renderer.setProperty(BOX, "opacity", KuitoValue.Number(0.5))
        renderer.setProperty(IMAGE, "objectFit", KuitoValue.Enum(1, "contain"))
        renderer.setProperty(IMAGE, "cache", KuitoValue.Enum(1, "memory"))
    }

    /** Layout props take the batch's typed values: the renderer parses none. */
    @Test
    fun layoutPropsParseNothing() = onRenderer { renderer ->
        val before = KuitoParses.count

        renderer.setProperty(BOX, "width", KuitoValue.Text("50%"))
        renderer.setProperty(BOX, "height", KuitoValue.Number(40.0))
        renderer.setProperty(BOX, "alignItems", KuitoValue.Enum(5, "center"))
        renderer.setProperty(BOX, "hidden", KuitoValue.Bool(true))
        renderer.setProperty(BOX, "flex", KuitoValue.Null)

        assertEquals(before, KuitoParses.count)
    }

    /** Decoration props take the batch's typed values: the renderer parses none. */
    @Test
    fun decorationPropsParseNothing() = onRenderer { renderer ->
        val before = KuitoParses.count

        renderer.setProperty(BOX, "borderRadius", KuitoValue.Number(8.0))
        renderer.setProperty(BOX, "borderWidth", KuitoValue.Number(2.0))
        renderer.setProperty(BOX, "borderColor", KuitoValue.Color(0xff000080.toInt()))
        renderer.setProperty(BOX, "shadowColor", KuitoValue.Color(0x00000040))
        renderer.setProperty(BOX, "overflow", KuitoValue.Enum(1, "hidden"))
        renderer.setProperty(BOX, "backgroundGradient", gradient(90, 0xff0000ff, 0x0000ffff))

        assertEquals(before, KuitoParses.count)
    }

    @Test
    fun aColorArrivesParsed() = onRenderer { renderer ->
        renderer.setProperty(BOX, "borderColor", KuitoValue.Color(0xff000080.toInt()))

        assertEquals(0x80ff0000.toInt(), checkNotNull(renderer.nodes[BOX]).borderColor)
    }

    @Test
    fun aNumberPropRejectsAColor() = assertUnsupportedValue(BOX, "borderRadius", KuitoValue.Color(-1))

    /** Text props take the batch's typed values: the renderer parses none. */
    @Test
    fun textPropsParseNothing() = onRenderer { renderer ->
        renderer.createView(LABEL, "Text", BOX, "label")

        val before = KuitoParses.count

        renderer.setProperty(LABEL, "text", KuitoValue.Text("Hello"))
        renderer.setProperty(LABEL, "color", KuitoValue.Color(0x112233ff))
        renderer.setProperty(LABEL, "fontSize", KuitoValue.Number(20.0))
        renderer.setProperty(LABEL, "fontWeight", KuitoValue.Enum(7, "600"))
        renderer.setProperty(LABEL, "textAlign", KuitoValue.Enum(1, "center"))
        renderer.setProperty(LABEL, "lineClamp", KuitoValue.Number(2.0))

        assertEquals(before, KuitoParses.count)
        assertEquals(600, checkNotNull(renderer.nodes[LABEL]).fontWeight)
    }

    /** Image, press and control props take the batch's typed values: the renderer parses none. */
    @Test
    fun imageAndControlPropsParseNothing() = onRenderer { renderer ->
        renderer.createView(PRESSABLE, "Pressable", BOX, "pressable")
        renderer.createView(TOGGLE, "Toggle", BOX, "toggle")

        val before = KuitoParses.count

        renderer.setProperty(IMAGE, "src", imageUrl("https://example.com/a.png"))
        renderer.setProperty(IMAGE, "placeholderColor", KuitoValue.Color(0xccccccff.toInt()))
        renderer.setProperty(IMAGE, "tintColor", KuitoValue.Color(0xff0000ff.toInt()))
        renderer.setProperty(IMAGE, "fadeDuration", KuitoValue.Number(200.0))
        renderer.setProperty(PRESSABLE, "pressedOpacity", KuitoValue.Number(0.5))
        renderer.setProperty(PRESSABLE, "longPressDuration", KuitoValue.Number(400.0))
        renderer.setProperty(PRESSABLE, "disabled", KuitoValue.Bool(true))
        renderer.setProperty(PRESSABLE, "haptic", KuitoValue.Enum(0, "light"))
        renderer.setProperty(TOGGLE, "checked", KuitoValue.Bool(true))

        assertEquals(before, KuitoParses.count)
    }

    /** List, scroll, safe-area, accessibility and gesture props take typed values: the renderer parses none. */
    @Test
    fun containerAndAccessibilityPropsParseNothing() = onRenderer { renderer ->
        renderer.createView(LIST, "List", BOX, "list")
        renderer.createView(SCROLL, "Scroll", BOX, "scroll")
        renderer.createView(SAFE_AREA, "SafeArea", BOX, "safe")

        val before = KuitoParses.count

        renderer.setProperty(LIST, "keys", KuitoValue.Keys(listOf(KuitoKeyEdit(INSERT, "a", 0), KuitoKeyEdit(INSERT, "b", 1))))
        renderer.setProperty(LIST, "numColumns", KuitoValue.Number(2.0))
        renderer.setProperty(LIST, "inverted", KuitoValue.Bool(true))
        renderer.setProperty(SCROLL, "emitsScroll", KuitoValue.Bool(true))
        renderer.setProperty(SCROLL, "scrollInterval", KuitoValue.Number(16.0))
        renderer.setProperty(SCROLL, "keyboardDismissMode", KuitoValue.Enum(1, "on-drag"))
        renderer.setProperty(SAFE_AREA, "edges", edges("top"))
        renderer.setProperty(BOX, "accessible", KuitoValue.Bool(true))
        renderer.setProperty(BOX, "label", KuitoValue.Text("Card"))
        renderer.setProperty(BOX, "role", KuitoValue.Enum(3, "button"))
        renderer.setProperty(BOX, "aria-checked", KuitoValue.Bool(true))
        renderer.setProperty(BOX, "gestures", gestures())

        assertEquals(before, KuitoParses.count)
    }

    /** A list's rows are no pages: only a ScrollView scrolls to one. */
    @Test
    fun aListTakesNoPageRequest() = onRenderer { renderer ->
        renderer.createView(LIST, "List", BOX, "list")

        val error = assertThrows(KuitoRenderError.UnsupportedValue::class.java) {
            renderer.setProperty(LIST, "scrollTo", scrollToPage(1))
        }

        assertEquals("scrollTo", error.prop)
    }

    /** Animation props take the batch's typed values: the renderer parses none. */
    @Test
    fun animationPropsParseNothing() = onRenderer { renderer ->
        val before = KuitoParses.count

        renderer.setProperty(BOX, "opacity", KuitoValue.Number(0.5))
        renderer.setProperty(BOX, "backgroundColor", KuitoValue.Color(0x336699ff))
        renderer.setProperty(BOX, "translateX", KuitoValue.Number(12.0))
        renderer.setProperty(BOX, "scale", KuitoValue.Null)
        renderer.setProperty(BOX, "rotate", KuitoValue.Number(45.0))
        renderer.setProperty(BOX, "exit", KuitoValue.Bool(true))
        renderer.setProperty(BOX, "layout", timingLayout(200))

        assertEquals(before, KuitoParses.count)
        assertEquals(0xff336699.toInt(), checkNotNull(renderer.nodes[BOX]).backgroundColor)
    }

    /** KuitoProps is generated from src/protocol/manifest.ts; a record's key finds its setter without hashing the name. */
    @Test
    fun everyManifestPropHasASetterByKey() {
        assertEquals(KuitoProps.byKey.size, KuitoProperties.byKey.size)
        assertEquals(KuitoProps.names, KuitoProps.byKey.filterIndexed { key, _ -> KuitoProperties.byKey[key] != null }.toSet())
    }

    @Test
    fun opacityRejectsANonNumber() = assertUnsupportedValue(BOX, "opacity", KuitoValue.Text("x"))

    @Test
    fun objectFitRejectsAnUnknownFit() = assertUnsupportedValue(IMAGE, "objectFit", KuitoValue.Text("bogus"))

    @Test
    fun cacheRejectsAnUnknownPolicy() = assertUnsupportedValue(IMAGE, "cache", KuitoValue.Text("bogus"))

    /** The error says what failed and where: the prop, the value and the view. */
    @Test
    fun aRejectedValueNamesThePropTheValueAndTheView() = onRenderer { renderer ->
        val message = assertThrows(KuitoRenderError::class.java) {
            renderer.setProperty(BOX, "opacity", KuitoValue.Text("x"))
        }.message.orEmpty()

        assertTrue(message, "opacity" in message)
        assertTrue(message, "\"x\"" in message)
        assertTrue(message, "box ($BOX)" in message)
    }

    @Test
    fun aPropOnAnotherKindIsUnsupported() = onRenderer { renderer ->
        val error = assertThrows(KuitoRenderError.UnsupportedProp::class.java) {
            renderer.setProperty(BOX, "objectFit", KuitoValue.Enum(1, "contain"))
        }

        assertEquals("objectFit", error.prop)
        assertTrue(error.view, "box ($BOX)" in error.view)
    }

    @Test
    fun aGestureConfigTakesItsKeysTypedValues() = onRenderer { renderer ->
        renderer.setProperty(BOX, "gestures", gestures(GestureSpec(1, "tap", mapOf("numberOfTaps" to 2, "enabled" to true))))
    }

    @Test
    fun aFlagWhereAGestureConfigTakesANumberIsAnError() = onRenderer { renderer ->
        val error = assertThrows(IllegalStateException::class.java) {
            renderer.setProperty(BOX, "gestures", gestures(GestureSpec(1, "tap", mapOf("numberOfTaps" to true))))
        }

        assertTrue(error.message, "numberOfTaps must be a finite number" in error.message.orEmpty())
    }

    @Test
    fun gesturesRepeatingATagAreUnsupported() =
        assertUnsupportedValue(BOX, "gestures", gestures(GestureSpec(1, "tap"), GestureSpec(1, "pan")))

    @Test
    fun aPropNoTableHasIsUnsupported() = onRenderer { renderer ->
        val error = assertThrows(KuitoRenderError.UnsupportedProp::class.java) {
            renderer.setProperty(BOX, "bogus", KuitoValue.Number(1.0))
        }

        assertEquals("bogus", error.prop)
    }
}

private const val BOX = 1
private const val IMAGE = 2
private const val LABEL = 3
private const val PRESSABLE = 4
private const val TOGGLE = 5
private const val LIST = 6
private const val SCROLL = 7
private const val SAFE_AREA = 8
private const val SHEET = 9
