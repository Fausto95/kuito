package dev.kuito.runtime.renderer

import android.view.View
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.Switch
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.kuito.runtime.renderer.gestures.GestureHandlerRegistry
import dev.kuito.runtime.renderer.keyboard.KuitoEditText
import dev.kuito.runtime.renderer.properties.KuitoLayoutProperties
import dev.kuito.runtime.renderer.styling.KuitoViewStyle
import dev.kuito.runtime.renderer.views.KuitoImageView
import dev.kuito.runtime.renderer.views.KuitoListCell
import dev.kuito.runtime.renderer.views.KuitoListView
import dev.kuito.runtime.renderer.views.KuitoNavigationScreenLayout
import dev.kuito.runtime.renderer.views.KuitoNavigationTabLayout
import dev.kuito.runtime.renderer.views.KuitoNavigationTabsLayout
import dev.kuito.runtime.renderer.views.KuitoPressableLayout
import dev.kuito.runtime.renderer.views.KuitoSafeAreaLayout
import dev.kuito.runtime.renderer.views.KuitoScrollable
import dev.kuito.runtime.renderer.views.KuitoScrolling
import dev.kuito.runtime.renderer.views.KuitoSheetLayout
import dev.kuito.runtime.renderer.views.KuitoSymbolView
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Null on the wire unsets a prop, and what that means is the manifest's
 * `unset` rule (docs/native-renderer.md#unset-props), never the setter's own
 * choice: the value the rule names, the view's initial state, or an error.
 * Each prop names a kind that takes it, a value to set before unsetting it,
 * and the native state it changes.
 */
@RunWith(AndroidJUnit4::class)
class KuitoUnsetTest {
    private class Probe(
        val kind: String,
        val parent: String?,
        val sample: KuitoValue,
        /** Props the view takes first, for a prop whose state needs them (a selection needs text). */
        val before: Map<String, KuitoValue> = emptyMap(),
        /** Null where Android keeps no state the prop could change; the reason is in its entry. */
        val read: ((KuitoAndroidRenderer, View, KuitoViewStyle) -> String)?,
    )

    private fun onMain(test: () -> Unit) {
        var failure: Throwable? = null

        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            try {
                test()
            } catch (error: Throwable) {
                failure = error
            }
        }
        failure?.let { throw it }
    }

    @Test
    fun everyPropTheRendererSetsHasAProbe() {
        // The layout engine resets the rest itself, the same way on both
        // platforms (native/shared/layout/KuitoLayoutStyle.cpp).
        val engine = KuitoLayoutProperties.setters.keys - PROBES.keys

        assertEquals(emptySet<String>(), KuitoProps.names - engine - PROBES.keys)
    }

    @Test
    fun unsetFollowsTheManifest() = onMain {
        val drift = PROBES.toSortedMap().flatMap { (name, probe) -> drift(name, probe) }

        assertEquals(emptyList<String>(), drift)
    }

    /** How unsetting [name] differs from its rule; empty when it follows it. */
    private fun drift(name: String, probe: Probe): List<String> {
        val unsetState = { state(probe, name, listOf(probe.sample, KuitoValue.Null)) }
        val drift = mutableListOf<String>()

        if (probe.read != null && state(probe, name, listOf(probe.sample)) == state(probe, name, emptyList())) {
            drift += "$name's probe doesn't see its sample"
        }

        when (val unset = KuitoProps.unsetByKey[KuitoProps.byKey.indexOf(name)]) {
            is KuitoUnset.Value -> {
                val expected = state(probe, name, listOf(probe.sample, unset.value))

                if (unsetState() != expected) drift += "$name unsets to ${unsetState()}, not ${unset.value} ($expected)"
            }
            KuitoUnset.Initial -> {
                val expected = state(probe, name, emptyList())

                if (unsetState() != expected) drift += "$name unsets to ${unsetState()}, not its initial $expected"
            }
            KuitoUnset.Required -> {
                val (renderer, id) = make(probe)
                val error = runCatching { renderer.setProperty(id, name, KuitoValue.Null) }.exceptionOrNull()

                if ((error as? KuitoRenderError.UnsupportedValue)?.prop != name) drift += "$name unset without an error: $error"
            }
        }

        return drift
    }

    private fun make(probe: Probe): Pair<KuitoAndroidRenderer, Int> {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val renderer = KuitoAndroidRenderer(context, FrameLayout(context)) { _, _, _ -> false }

        probe.parent?.let { renderer.createView(1, it, 0, it) }
        renderer.createView(ID, probe.kind, if (probe.parent == null) 0 else 1, probe.kind)
        probe.before.toSortedMap().forEach { (name, value) -> renderer.setProperty(ID, name, value) }

        return renderer to ID
    }

    /** The probed state of a new view after setting [values] in turn. */
    private fun state(probe: Probe, name: String, values: List<KuitoValue>): String {
        val (renderer, id) = make(probe)

        for (value in values) renderer.setProperty(id, name, value)

        val style = renderer.nodes.getValue(id)

        return probe.read?.invoke(renderer, style.view ?: error("$name: no view"), style) ?: "unobserved"
    }

    private companion object {
        const val ID = 2
        val RED = KuitoValue.Color(0xff0000ff.toInt())

        inline fun <reified V : View> on(
            kind: String,
            sample: KuitoValue,
            parent: String? = null,
            before: Map<String, KuitoValue> = emptyMap(),
            crossinline read: (V, KuitoViewStyle) -> Any?,
        ) = Probe(kind, parent, sample, before) { _, view, style -> read(view as V, style).toString() }

        fun box(sample: KuitoValue, read: (View, KuitoViewStyle) -> Any?) = on<View>("Box", sample, read = read)

        /** A prop Android takes but keeps no state for. */
        fun unobserved(kind: String, sample: KuitoValue) = Probe(kind, null, sample, read = null)

        /** A field the view keeps private. */
        fun field(target: Any, name: String): Any? {
            var type: Class<*>? = target.javaClass

            while (type != null) {
                runCatching { type.getDeclaredField(name) }.getOrNull()?.let { return it.apply { isAccessible = true }.get(target) }
                type = type.superclass
            }

            error("${target.javaClass.simpleName} has no field $name")
        }

        val PROBES: Map<String, Probe> = mapOf(
            // Animation
            "opacity" to box(KuitoValue.Number(0.5)) { view, _ -> view.alpha },
            "backgroundColor" to box(RED) { _, style -> style.backgroundColor },
            "translateX" to box(KuitoValue.Number(5.0)) { view, _ -> view.translationX },
            "translateY" to box(KuitoValue.Number(5.0)) { view, _ -> view.translationY },
            "scale" to box(KuitoValue.Number(2.0)) { view, _ -> "${view.scaleX} ${view.scaleY}" },
            "scaleX" to box(KuitoValue.Number(2.0)) { view, _ -> view.scaleX },
            "scaleY" to box(KuitoValue.Number(2.0)) { view, _ -> view.scaleY },
            "rotate" to box(KuitoValue.Number(30.0)) { view, _ -> view.rotation },
            "exit" to box(KuitoValue.Bool(true)) { _, style -> style.exit },
            "exited" to box(KuitoValue.Bool(true)) { _, style -> style.exited },
            "layout" to box(timingLayout(200)) { _, style -> style.layout.frameAnimator != null },
            // Layout props Android draws too
            "hidden" to box(KuitoValue.Bool(true)) { view, _ -> view.visibility },
            "gap" to on<KuitoListView>("List", KuitoValue.Number(8.0)) { list, _ -> "${field(list, "rowGapPx")} ${field(list, "columnGapPx")}" },
            "rowGap" to on<KuitoListView>("List", KuitoValue.Number(8.0)) { list, _ -> field(list, "rowGapPx") },
            "columnGap" to on<KuitoListView>("List", KuitoValue.Number(8.0)) { list, _ -> field(list, "columnGapPx") },
            // Decoration
            "borderRadius" to box(KuitoValue.Number(8.0)) { _, style -> style.cornerRadius },
            "overflow" to box(KuitoValue.Enum(1, "hidden")) { view, _ -> view.clipToOutline },
            "borderWidth" to box(KuitoValue.Number(2.0)) { _, style -> style.borderWidth },
            "borderColor" to box(RED) { _, style -> style.borderColor },
            "shadowColor" to box(RED) { view, _ -> view.outlineSpotShadowColor },
            "shadowRadius" to box(KuitoValue.Number(6.0)) { view, _ -> view.elevation },
            // Android draws shadows from elevation: the platform's light source fixes the offset.
            "shadowOffsetX" to unobserved("Box", KuitoValue.Number(3.0)),
            "shadowOffsetY" to unobserved("Box", KuitoValue.Number(3.0)),
            "backgroundGradient" to box(gradient(90, 0xff0000ff, 0x0000ffff)) { _, style ->
                style.gradientColors?.toList()
            },
            // Text
            "text" to on<TextView>("Text", KuitoValue.Text("Hello")) { view, _ -> view.text },
            "color" to on<TextView>("Text", RED) { view, _ -> view.textColors },
            "fontSize" to on<TextView>("Text", KuitoValue.Number(30.0)) { view, _ -> view.textSize },
            "fontWeight" to on<TextView>("Text", KuitoValue.Enum(1, "bold")) { _, style -> style.fontWeight },
            "fontFamily" to on<TextView>("Text", KuitoValue.Text("serif")) { _, style -> style.fontFamily },
            "fontStyle" to on<TextView>("Text", KuitoValue.Enum(1, "italic")) { _, style -> style.italic },
            "lineHeight" to on<TextView>("Text", KuitoValue.Number(30.0)) { view, _ -> "${view.lineSpacingExtra} ${view.lineSpacingMultiplier}" },
            "letterSpacing" to on<TextView>("Text", KuitoValue.Number(2.0)) { view, _ -> view.letterSpacing },
            "textAlign" to on<TextView>("Text", KuitoValue.Enum(1, "center")) { view, _ -> view.gravity },
            "textTransform" to on<TextView>("Text", KuitoValue.Enum(1, "uppercase")) { _, style -> style.textTransform },
            "lineClamp" to on<TextView>("Text", KuitoValue.Number(2.0)) { view, _ -> view.maxLines },
            "maxFontScale" to on<TextView>("Text", KuitoValue.Number(2.0)) { _, style -> style.maxFontScale },
            // Control
            "disabled" to on<KuitoPressableLayout>("Pressable", KuitoValue.Bool(true)) { view, _ -> view.disabled },
            "placeholder" to on<EditText>("TextField", KuitoValue.Text("Name")) { field, _ -> field.hint },
            "placeholderTextColor" to on<EditText>("TextField", RED) { field, _ -> field.hintTextColors },
            "selectionColor" to on<EditText>("TextField", RED) { field, _ -> field.highlightColor },
            "checked" to on<Switch>("Toggle", KuitoValue.Bool(true)) { toggle, _ -> toggle.isChecked },
            "animating" to on<ProgressBar>("Spinner", KuitoValue.Bool(false)) { spinner, _ -> spinner.visibility },
            // Press
            "pressedOpacity" to on<KuitoPressableLayout>("Pressable", KuitoValue.Number(0.5)) { view, _ -> view.activeOpacity },
            "pressedScale" to on<KuitoPressableLayout>("Pressable", KuitoValue.Number(0.9)) { view, _ -> view.pressedScale },
            "longPressDuration" to on<KuitoPressableLayout>("Pressable", KuitoValue.Number(900.0)) { view, _ -> view.longPressDuration },
            "hitArea" to on<KuitoPressableLayout>("Pressable", KuitoValue.Number(10.0)) { view, _ -> view.hitSlop },
            "haptic" to on<KuitoPressableLayout>("Pressable", KuitoValue.Enum(0, "light")) { view, _ -> view.haptic },
            // Image
            "src" to on<KuitoImageView>("Image", imageUrl("https://example.com/a.png")) { image, _ -> field(image, "source") },
            "objectFit" to on<ImageView>("Image", KuitoValue.Enum(1, "contain")) { image, _ -> image.scaleType },
            "placeholderColor" to on<KuitoImageView>("Image", RED) { image, _ -> image.placeholderColor },
            "fadeDuration" to on<KuitoImageView>("Image", KuitoValue.Number(300.0)) { image, _ -> image.transitionDuration },
            "tintColor" to on<KuitoImageView>("Image", RED) { image, _ -> image.tint },
            "cache" to on<KuitoImageView>("Image", KuitoValue.Enum(3, "none")) { image, _ -> image.cachePolicy },
            "thumbhash" to on<KuitoImageView>("Image", KuitoValue.Text("4AcKNZqAh4dwd3d4eHh3h3CAB/eI")) { image, _ ->
                field(image, "thumbHash")?.let { field(it, "text") }
            },
            // Symbol
            "name" to on<KuitoSymbolView>("Symbol", symbolName("star")) { symbol, _ -> field(symbol, "name") },
            "size" to on<KuitoSymbolView>("Symbol", KuitoValue.Number(40.0)) { symbol, _ -> field(symbol, "sizeDp") },
            "weight" to on<KuitoSymbolView>("Symbol", KuitoValue.Enum(6, "bold")) { symbol, _ -> field(symbol, "weight") },
            // Scroll
            "emitsScroll" to on<View>("Scroll", KuitoValue.Bool(true)) { view, _ -> (view as KuitoScrollable).emitsScroll },
            "emitsMotion" to on<View>("Scroll", KuitoValue.Bool(true)) { view, _ -> (view as KuitoScrollable).motion.on },
            "scrollInterval" to on<View>("Scroll", KuitoValue.Number(16.0)) { view, _ -> (view as KuitoScrollable).scrollEventThrottle },
            "reachEndThreshold" to on<View>("Scroll", KuitoValue.Number(2.0)) { view, _ -> (view as KuitoScrollable).endReachedThreshold },
            "refreshable" to on<View>("Scroll", KuitoValue.Bool(true)) { view, _ -> (view as KuitoScrollable).refreshable },
            "refreshing" to on<View>("Scroll", KuitoValue.Bool(true)) { view, _ -> (view as KuitoScrollable).refreshShown },
            "scrollbar" to on<View>("Scroll", KuitoValue.Bool(false)) { view, _ ->
                val scroller = (view as KuitoScrollable).scroller

                "${scroller.isVerticalScrollBarEnabled} ${scroller.isHorizontalScrollBarEnabled}"
            },
            "paging" to on<View>("Scroll", KuitoValue.Bool(true)) { view, _ -> (view as KuitoScrolling).snap.paging },
            "snapOffsets" to on<View>("Scroll", numberList(100)) { view, _ -> (view as KuitoScrolling).snap.offsets },
            // List
            "keys" to on<KuitoListView>("List", KuitoValue.Keys(listOf(KuitoKeyEdit(KuitoKeyEdit.Op.INSERT, "a", 0)))) { list, _ -> list.keys },
            "spanningKeys" to on<KuitoListView>("List", stringList("a")) { list, _ -> field(list, "spanningKeys") },
            "stickyKeys" to on<KuitoListView>("List", stringList("a")) { list, _ -> field(list, "stickyKeys") },
            "numColumns" to on<KuitoListView>("List", KuitoValue.Number(3.0)) { list, _ -> field(list, "columns") },
            "inverted" to on<KuitoListView>("List", KuitoValue.Bool(true)) { list, _ -> list.inverted },
            "estimatedItemSize" to on<KuitoListView>("List", KuitoValue.Number(80.0)) { list, _ -> field(list, "sizes")?.let { field(it, "estimatedPx") } },
            "initialScrollKey" to on<KuitoListView>("List", KuitoValue.Text("a")) { list, _ -> list.initialScrollKey },
            // A request: Android scrolls at once and keeps nothing pending.
            "scrollTo" to unobserved("List", scrollToOffset(0)),
            "emitsViewable" to on<KuitoListView>("List", KuitoValue.Bool(true)) { list, _ -> list.emitsViewable },
            "viewableThreshold" to on<KuitoListView>("List", KuitoValue.Number(0.5)) { list, _ -> list.viewableThreshold },
            "cellKey" to on<KuitoListCell>("ListCell", KuitoValue.Text("a")) { cell, _ -> cell.renderedKey },
            // Safe area, sheet, navigation
            "edges" to on<KuitoSafeAreaLayout>("SafeArea", edges("top")) { area, _ -> area.edges.sorted() },
            // Read, then closed: a sheet left open presents a dialog later, which a renderer with no activity can't.
            "open" to on<KuitoSheetLayout>("Sheet", KuitoValue.Bool(true)) { sheet, _ -> sheet.open.also { sheet.open = false } },
            "snapPoints" to on<KuitoSheetLayout>("Sheet", snapPoints(200)) { sheet, _ -> sheet.snapPoints },
            "grabber" to on<KuitoSheetLayout>("Sheet", KuitoValue.Bool(false)) { sheet, _ -> sheet.grabber },
            "dismissible" to on<KuitoSheetLayout>("Sheet", KuitoValue.Bool(false)) { sheet, _ -> sheet.dismissible },
            "sheetCornerRadius" to on<KuitoSheetLayout>("Sheet", KuitoValue.Number(12.0)) { sheet, _ -> sheet.cornerRadius },
            "presentation" to on<KuitoSheetLayout>("Sheet", KuitoValue.Enum(1, "modal")) { sheet, _ -> sheet.presentation },
            "title" to on<KuitoNavigationScreenLayout>("NavigationScreen", KuitoValue.Text("Home"), "NavigationStack") { screen, _ -> screen.title },
            "header" to on<KuitoNavigationScreenLayout>("NavigationScreen", KuitoValue.Bool(false), "NavigationStack") { screen, _ ->
                screen.headerShown
            },
            "headerItems" to on<KuitoNavigationScreenLayout>(
                "NavigationScreen",
                headerItems(HeaderItem("Add")),
                "NavigationStack",
            ) { screen, _ -> screen.actions.items },
            "largeTitle" to on<KuitoNavigationScreenLayout>("NavigationScreen", KuitoValue.Bool(true), "NavigationStack") { screen, _ ->
                screen.largeTitleShown
            },
            "search" to on<KuitoNavigationScreenLayout>("NavigationScreen", headerSearch("Shows"), "NavigationStack") { screen, _ ->
                screen.actions.search
            },
            "icon" to on<KuitoNavigationTabLayout>("NavigationTab", tabSymbol("star"), "NavigationTabs") { tab, _ -> tab.icon != null },
            "selectedIndex" to on<KuitoNavigationTabsLayout>("NavigationTabs", KuitoValue.Number(1.0)) { tabs, _ -> tabs.selectedIndex },
            "sharedId" to box(KuitoValue.Text("hero")) { _, style -> style.sharedId },
            // Accessibility
            "accessible" to box(KuitoValue.Bool(true)) { _, style -> style.accessibility.accessible },
            "label" to box(KuitoValue.Text("Close")) { view, _ -> view.contentDescription },
            "hint" to box(KuitoValue.Text("Closes it")) { _, style -> style.accessibility.hint },
            "role" to box(KuitoValue.Enum(3, "button")) { _, style -> style.accessibility.role },
            "aria-hidden" to box(KuitoValue.Bool(true)) { view, _ -> view.importantForAccessibility },
            "actions" to box(actions("activate")) { _, style -> style.accessibility.actions },
            "live" to box(KuitoValue.Enum(1, "polite")) { view, _ -> view.accessibilityLiveRegion },
            "aria-disabled" to box(KuitoValue.Bool(true)) { _, style -> style.accessibility.facts["aria-disabled"] },
            "aria-selected" to box(KuitoValue.Bool(true)) { _, style -> style.accessibility.facts["aria-selected"] },
            "aria-checked" to box(KuitoValue.Bool(true)) { _, style -> style.accessibility.facts["aria-checked"] },
            "aria-busy" to box(KuitoValue.Bool(true)) { _, style -> style.accessibility.facts["aria-busy"] },
            "aria-expanded" to box(KuitoValue.Bool(true)) { _, style -> style.accessibility.facts["aria-expanded"] },
            "aria-valuemin" to box(KuitoValue.Number(0.0)) { _, style -> style.accessibility.facts["aria-valuemin"] },
            "aria-valuemax" to box(KuitoValue.Number(10.0)) { _, style -> style.accessibility.facts["aria-valuemax"] },
            "aria-valuenow" to box(KuitoValue.Number(5.0)) { _, style -> style.accessibility.facts["aria-valuenow"] },
            "aria-valuetext" to box(KuitoValue.Text("half")) { _, style -> style.accessibility.facts["aria-valuetext"] },
            // Keyboard
            "enterKeyHint" to on<EditText>("TextField", KuitoValue.Enum(4, "search")) { field, _ -> field.imeOptions },
            "submitBehavior" to on<KuitoEditText>("TextField", KuitoValue.Enum(0, "submit")) { field, _ -> field.submitBehavior },
            "autoFocus" to on<KuitoEditText>("TextField", KuitoValue.Bool(true)) { field, _ -> field.autoFocus },
            "keyboardDismissMode" to on<View>("Scroll", KuitoValue.Enum(1, "on-drag")) { view, _ -> (view as KuitoScrollable).keyboard.dismissMode },
            "keyboardShouldPersistTaps" to on<View>("Scroll", KuitoValue.Enum(1, "always")) { view, _ ->
                (view as KuitoScrollable).keyboard.persistTaps
            },
            "automaticallyAdjustKeyboardInsets" to on<View>("Scroll", KuitoValue.Bool(false)) { view, _ ->
                (view as KuitoScrollable).keyboard.adjustsInsets
            },
            "keyboardAvoidance" to box(KuitoValue.Enum(1, "padding")) { _, style -> style.keyboardAvoider?.mode },
            // Input
            "type" to on<EditText>("TextField", KuitoValue.Enum(1, "password")) { field, _ -> field.inputType },
            "inputMode" to on<EditText>("TextField", KuitoValue.Enum(3, "numeric")) { field, _ -> field.inputType },
            "autoComplete" to on<EditText>("TextField", KuitoValue.Enum(1, "username")) { field, _ ->
                "${field.autofillHints?.toList()} ${field.importantForAutofill}"
            },
            "autoCapitalize" to on<EditText>("TextField", KuitoValue.Enum(0, "none")) { field, _ -> field.inputType },
            "maxLength" to on<KuitoEditText>("TextField", KuitoValue.Number(2.0)) { field, _ -> field.maxLength },
            "spellCheck" to on<EditText>("TextField", KuitoValue.Bool(false)) { field, _ -> field.inputType },
            "lines" to on<EditText>("MultilineTextField", lineCount(3)) { field, _ -> "${field.minLines} ${field.maxLines}" },
            "selection" to on<EditText>("TextField", selection(1, 3), before = mapOf("text" to KuitoValue.Text("hello"))) { field, _ ->
                "${field.selectionStart} ${field.selectionEnd}"
            },
            "emitsSelection" to on<KuitoEditText>("TextField", KuitoValue.Bool(true)) { field, _ -> field.emitsSelection },
            "formats" to on<KuitoEditText>("TextField", KuitoValue.Bool(true)) { field, _ -> field.formats },
            // Gestures
            "gestures" to Probe("Box", null, gestures(GestureSpec(1, "tap"))) { renderer, view, _ ->
                (field(renderer, "gestures") as GestureHandlerRegistry).getHandlersForView(view)?.size.toString()
            },
        )
    }
}
