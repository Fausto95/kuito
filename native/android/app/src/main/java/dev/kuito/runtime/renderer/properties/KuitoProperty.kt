package dev.kuito.runtime.renderer.properties

import android.view.View
import android.view.ViewGroup
import dev.kuito.runtime.renderer.KuitoEventEmitter
import dev.kuito.runtime.renderer.KuitoProps
import dev.kuito.runtime.renderer.KuitoRenderError
import dev.kuito.runtime.renderer.KuitoStructRecord
import dev.kuito.runtime.renderer.KuitoUnset
import dev.kuito.runtime.renderer.quoted
import dev.kuito.runtime.renderer.KuitoValue
import dev.kuito.runtime.renderer.gestures.GestureHandlerRegistry
import dev.kuito.runtime.renderer.keyboard.KuitoKeyboard
import dev.kuito.runtime.renderer.styling.KuitoViewStyle
import dev.kuito.runtime.renderer.styling.argb

/**
 * What a property setter needs: the view, the view that lays out its children
 * (a ScrollView's content, otherwise the view), and its style.
 */
internal class KuitoPropertyContext(
    val id: Int,
    /** The prop's key on the wire (KuitoProps.byKey), or KuitoMutations.NAMED_PROP. */
    val key: Int,
    val name: String,
    val view: View,
    val layout: View,
    val style: KuitoViewStyle,
    val density: Float,
    val events: KuitoEventEmitter,
    val keyboard: KuitoKeyboard,
    val gestures: GestureHandlerRegistry,
) {
    fun dp(value: Float) = (value * density).toInt()

    /** This view takes no such prop: it is another kind's. */
    fun unsupportedProp(): Nothing = throw KuitoRenderError.UnsupportedProp(name, style.described(id))

    /** The prop takes no such value; [reason] says what it takes. */
    fun unsupportedValue(value: KuitoValue, reason: String): Nothing =
        throw KuitoRenderError.UnsupportedValue(name, value.quoted, style.described(id), reason)

    // A typed value as the kind a setter takes; another kind is unsupported.
    // Null never reaches a setter of a prop the manifest unsets to a value;
    // one that restores its initial state checks for null before it reads the
    // value (docs/native-renderer.md#unset-props).

    fun number(value: KuitoValue): Float = (value as? KuitoValue.Number)?.value?.toFloat() ?: unsupportedValue(value, "expects a number")

    /** An Android color int. */
    fun color(value: KuitoValue): Int = (value as? KuitoValue.Color)?.let { argb(it.rgba) } ?: unsupportedValue(value, "expects a color")

    /** An enum's value as written. */
    fun keyword(value: KuitoValue): String = (value as? KuitoValue.Enum)?.text ?: unsupportedValue(value, "expects one of its values")

    fun flag(value: KuitoValue): Boolean = (value as? KuitoValue.Bool)?.value ?: unsupportedValue(value, "expects a boolean")

    fun text(value: KuitoValue): String = (value as? KuitoValue.Text)?.value ?: unsupportedValue(value, "expects a string")

    /**
     * A structured prop's record, which C++ checked against the prop's schema:
     * read it through KuitoPropValues.
     */
    fun record(value: KuitoValue): KuitoStructRecord =
        (value as? KuitoValue.Struct)?.record ?: unsupportedValue(value, "expects a structured value")

    fun layoutGroup(): ViewGroup? = layout as? ViewGroup
}

/** Sets a prop from the value the host batch typed (docs/native-scheduling.md). */
internal typealias KuitoPropertySetter = (KuitoPropertyContext, KuitoValue) -> Unit

/** A setter for one kind of view: on any other view the prop is unsupported. */
internal inline fun <reified V> on(crossinline apply: (KuitoPropertyContext, V, KuitoValue) -> Unit): KuitoPropertySetter =
    { context, value -> apply(context, context.view as? V ?: context.unsupportedProp(), value) }

/**
 * A prop that can change a measured leaf's content size (its text, font,
 * rows): the leaf measures again in the next pass. Any other prop leaves the
 * layout as it is.
 */
internal fun <T> remeasured(set: (KuitoPropertyContext, T) -> Unit): (KuitoPropertyContext, T) -> Unit = { context, value ->
    set(context, value)
    context.style.layout.markContentDirty()
    context.layOutContained()
}

/**
 * A measure change inside a fixed-size box: that box lays out now. The
 * screen root lays out only when the climb reached it.
 */
private fun KuitoPropertyContext.layOutContained() {
    var top = style.layout

    while (top.parent?.dirty == true) top = checkNotNull(top.parent)

    if (top.parent == null) return

    val box = top.box()

    if (box.width == 0f && box.height == 0f) return

    top.calculate(box.width, box.height, view.resources.displayMetrics.density)
}

/** Every native prop, by name. Each table owns one concern. */
internal object KuitoProperties {
    private val all: Map<String, KuitoPropertySetter> = listOf(
        KuitoAnimationProperties.setters,
        KuitoLayoutProperties.setters,
        KuitoDecorationProperties.setters,
        KuitoTextProperties.setters,
        KuitoControlProperties.setters,
        KuitoPressProperties.setters,
        KuitoImageProperties.setters,
        KuitoSymbolProperties.setters,
        KuitoScrollProperties.setters,
        KuitoListProperties.setters,
        KuitoSafeAreaProperties.setters,
        KuitoSheetProperties.setters,
        KuitoNavigationProperties.setters,
        KuitoAccessibilityProperties.setters,
        KuitoKeyboardProperties.setters,
        KuitoInputProperties.setters,
        KuitoGestureProperties.setters,
        KuitoMotionProperties.setters,
    ).fold(emptyMap()) { merged, table ->
        check(merged.keys.none(table::containsKey)) { "A prop belongs to one table" }
        merged + table
    }

    /**
     * Each prop's setter by its key on the wire ([KuitoProps.byKey]), taking
     * null as the manifest's unset rule says; null where Android has none. A
     * record's key finds it without hashing a name.
     */
    val byKey: Array<KuitoPropertySetter?> =
        KuitoProps.byKey.zip(KuitoProps.unsetByKey) { name, unset -> all[name]?.let { unsetting(unset, it) } }.toTypedArray()

    /** Null as [unset] says: the value it stands for, the setter's own initial state, or an error. */
    fun unsetting(unset: KuitoUnset, set: KuitoPropertySetter): KuitoPropertySetter = when (unset) {
        is KuitoUnset.Value -> { context, value -> set(context, if (value == KuitoValue.Null) unset.value else value) }
        KuitoUnset.Initial -> set
        KuitoUnset.Required -> { context, value ->
            if (value == KuitoValue.Null) context.unsupportedValue(value, "is required: it can't be unset")

            set(context, value)
        }
    }
}
