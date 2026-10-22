package dev.kuito.runtime.renderer

import android.view.View
import android.widget.EditText
import dev.kuito.runtime.renderer.accessibility.KuitoAccessibilityMonitor
import dev.kuito.runtime.renderer.keyboard.KuitoFocus
import dev.kuito.runtime.renderer.keyboard.KuitoKeyboard
import org.json.JSONArray

/** What a command needs: its target view (none for an app-wide command), its argument, and the renderer's state. */
internal class KuitoCommandContext(
    val name: String,
    val view: View?,
    /** The target as errors name it. */
    val target: String,
    val argument: String,
    val root: View,
    val keyboard: KuitoKeyboard,
    val accessibility: KuitoAccessibilityMonitor,
    val devtools: KuitoDevtoolsOverlay?,
    val lookup: (Int) -> View?,
) {
    fun targetView(): View = view ?: throw KuitoRenderError.UnsupportedProp(name, target)

    fun overlay(): KuitoDevtoolsOverlay = devtools ?: throw KuitoRenderError.UnsupportedProp(name, "a release build")

    fun field(): EditText = targetView() as? EditText ?: throw KuitoRenderError.UnsupportedProp(name, target)
}

/**
 * The devtools' hands on the device (docs/devtools.md): outlines for the views
 * of the Components panel's selection, a tap that picks a view, and the cause
 * of each update the highlighter flashes.
 */
interface KuitoDevtoolsOverlay {
    fun highlight(views: List<View>)
    fun inspect(enabled: Boolean)
    /** A new runtime asks whether updates are highlighted (the `devtools.updates` event). */
    fun hello()
    /** The signal write behind [view]'s update in this batch (`visits = 2`). */
    fun cause(view: View, text: String)
}

/** One-shot instructions from JavaScript, by name, applied in order with the view mutations around them. */
internal object KuitoCommands {
    val all: Map<String, (KuitoCommandContext) -> Unit> = mapOf(
        "focus" to { context -> KuitoFocus.focus(context.field()) },
        "blur" to { context -> KuitoFocus.blur(context.field()) },
        "keyboard.dismiss" to { context -> KuitoFocus.dismiss(context.root) },
        // keyboard.height: its moves go out every frame while on (docs/keyboard.md#keyboard).
        "keyboard.motion" to { context -> context.keyboard.motion.on = context.argument == "on" },
        "accessibility.announce" to { context -> context.accessibility.announce(context.argument) },
        "accessibility.focus" to { context -> context.accessibility.focus(context.targetView()) },
        "accessibility.status" to { context -> context.accessibility.sendStatus() },
        // The Components panel: outline these views; pick one by tapping.
        "devtoolsHighlight" to { context ->
            val ids = JSONArray(context.argument)

            context.overlay().highlight((0 until ids.length()).mapNotNull { context.lookup(ids.getInt(it)) })
        },
        "devtoolsInspect" to { context -> context.overlay().inspect(context.argument == "on") },
        "devtoolsHello" to { context -> context.overlay().hello() },
        // `[view, cause]`. A layout-only view has no native view to flash: its cause has nowhere to show.
        "devtoolsCause" to { context ->
            val cause = JSONArray(context.argument)

            context.lookup(cause.getInt(0))?.let { context.overlay().cause(it, cause.getString(1)) }
        },
    )
}
