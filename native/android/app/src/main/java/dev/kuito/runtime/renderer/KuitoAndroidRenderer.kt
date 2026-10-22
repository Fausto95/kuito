package dev.kuito.runtime.renderer

import android.content.Context
import android.util.DisplayMetrics
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import dev.kuito.runtime.renderer.accessibility.KuitoAccessibilityMonitor
import dev.kuito.runtime.renderer.gestures.GestureHandlerRegistry
import dev.kuito.runtime.renderer.gestures.GestureHandlerRootHelper
import dev.kuito.runtime.renderer.keyboard.KuitoKeyboard
import dev.kuito.runtime.renderer.layout.KuitoFlexLayout
import dev.kuito.runtime.renderer.layout.KuitoLayoutNode
import dev.kuito.runtime.renderer.layout.KuitoRootLayout
import dev.kuito.runtime.renderer.layout.relayOut
import dev.kuito.runtime.renderer.properties.KuitoProperties
import dev.kuito.runtime.renderer.properties.KuitoPropertySetter
import dev.kuito.runtime.renderer.properties.KuitoPropertyContext
import dev.kuito.runtime.renderer.properties.KuitoTextProperties
import dev.kuito.runtime.renderer.styling.KuitoExiting
import dev.kuito.runtime.renderer.styling.KuitoViewStyle
import dev.kuito.runtime.renderer.views.KuitoScrolling
import java.util.Locale

/**
 * Android Views implementation of Kuito's native view mutation contract: the
 * view tree. Views come from KuitoViewFactory, props go through
 * KuitoProperties, and KuitoRootLayout positions every view with the shared
 * flexbox engine. Every node has a layout node; a flattened (layout-only)
 * node has no view, and its children's views join the nearest ancestor that
 * has one (docs/flattening.md). Calls must be made on the UI thread.
 */
class KuitoAndroidRenderer internal constructor(
    private val context: Context,
    private val container: ViewGroup,
    /**
     * Receives each native event: the view's number (0 for the app), the
     * event, and its payload's record, which the emitter reuses once this
     * returns. True when the UI thread's kernel took it.
     */
    private val onEvent: (Int, String, KuitoEventRecord) -> Boolean,
) {
    /**
     * The tree's views emit through it. clear() detaches it: the next runtime
     * reuses the tree's ids, so a view it removed, such as an image still
     * loading, would reach handlers that runtime never registered.
     */
    private var events = KuitoEventEmitter(onEvent)

    /** Called after a view is created or updated: for update highlighting and first-frame detection. */
    var onUpdate: ((View) -> Unit)? = null
    /** What the Components panel draws and picks with (docs/devtools.md); debug builds set it. */
    var devtools: KuitoDevtoolsOverlay? = null
    private val root = KuitoRootLayout(context)
    /**
     * Every view's record by its number: the views in Kuito's tree, and
     * removed ones still on screen until they have left (`exiting`).
     */
    internal val nodes = mutableMapOf<Int, KuitoViewStyle>()
    private val density get() = context.resources.displayMetrics.density
    /** The metrics text sizes were last set with, to read them back in sp. */
    private val textMetrics = DisplayMetrics().apply { setTo(context.resources.displayMetrics) }
    /** The language text was last measured in: where a line may break is its rule. */
    private var textLocale = Locale.getDefault()

    // The keyboard and accessibility monitors outlive every tree.
    internal val keyboard = KuitoKeyboard(root, KuitoEventEmitter(onEvent))
    private val accessibility = KuitoAccessibilityMonitor(root, KuitoEventEmitter(onEvent))
    private val gestures = GestureHandlerRegistry()
    private val links = KuitoTreeLinks(::sharedElements, gestures) { node -> nodes.values.firstOrNull { it.layout === node } }

    init {
        root.gestures = GestureHandlerRootHelper(root, gestures)
        root.unclip()
        container.addView(root, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }

    fun clear() {
        for (node in nodes.values) node.sheet?.let { sheet ->
            sheet.gestures?.release()
            sheet.dismissFromApp()
        }
        gestures.dropAllHandlers()
        // Exiting views first: their nodes still hang under their parents'.
        for ((id, node) in nodes.toList()) if (node.exiting == KuitoExiting.Animated) {
            node.view?.let(::detach)
            exited(id, node)
        }
        root.removeAllViews()
        for (node in nodes.values) if (node.exiting == null) node.layout.release()
        nodes.clear()
        KuitoModuleViews.unmountAll()
        events.detach()
        events = KuitoEventEmitter(onEvent)
    }

    /** The activity is gone: frees what the renderer holds natively. Nothing runs on it after this. */
    fun close() {
        root.gestures?.release()
        gestures.close()
    }

    /**
     * The activity handles configuration changes in place. A new size needs
     * nothing here: the root lays out again at it. A new language may turn
     * the app's direction and where its text may break. A new font scale
     * resizes every text. Either way every text is measured again.
     */
    fun configurationChanged() {
        root.followFirstLanguage()

        @Suppress("DEPRECATION") // The font scale lives in scaledDensity and, from Android 14, a hidden converter.
        val rescaled = context.resources.displayMetrics.scaledDensity != textMetrics.scaledDensity
        val relocalized = Locale.getDefault() != textLocale

        if (!rescaled && !relocalized) return

        for (node in nodes.values) {
            val view = node.view as? TextView ?: continue

            if (rescaled) KuitoTextProperties.rescale(view, node, textMetrics, context.resources.displayMetrics)
            node.layout.markDirty()
        }

        textMetrics.setTo(context.resources.displayMetrics)
        textLocale = Locale.getDefault()
        root.requestLayout()
    }

    /** Applies record [index] of [batch]. UI, UIScript, UIKernel and UIBundle records are the UI runtime's: the shell hands those to it. */
    fun apply(batch: KuitoMutations, index: Int) {
        val id = batch.ids[index]

        when (batch.ops[index]) {
            KuitoOp.CREATE -> createView(id, batch.text(index), batch.parents[index], batch.name(index), batch.ints[index] != 0)
            KuitoOp.REMOVE -> removeView(id)
            KuitoOp.MOVE -> moveView(id, batch.parents[index], batch.ints[index])
            KuitoOp.FLATTEN -> setFlattened(id, batch.ints[index] != 0)
            KuitoOp.PROP -> setProperty(id, batch.keys[index], batch.propName(index), batch.value(index))
            KuitoOp.COMMAND -> command(id, batch.name(index), batch.text(index))
            else -> throw KuitoRenderError.InvalidTree("record ${batch.ops[index]} is not a view mutation")
        }
    }

    /** A Prop record the UI thread wrote. */
    fun applyDriven(batch: KuitoMutations, index: Int) =
        setDrivenProperty(batch.ids[index], batch.keys[index], batch.propName(index), batch.value(index))

    /**
     * [parent] 0 is the root; [label] names the view in errors and is how a
     * list adopts the cell it asked the kernel for.
     */
    fun createView(id: Int, kind: String, parent: Int, label: String, flattened: Boolean = false) {
        if (KuitoCost.Counts.ENABLED) KuitoCost.Counts.recordsApplied++
        if (id in nodes) throw KuitoRenderError.InvalidTree("${describe(id)} exists already")

        val parentNode = if (parent == 0) null else node(parent)

        if (!KuitoViewFactory.has(kind)) throw KuitoRenderError.InvalidTree("no view kind is named $kind")

        val layout = KuitoLayoutNode(kind)

        // A measured leaf sizes itself through its view; a page is its container's.
        if (flattened && (layout.measured || kind in KuitoViewFactory.pages)) {
            throw KuitoRenderError.InvalidTree("a $kind cannot be flattened")
        }

        // A page belongs to its container; a host decides which children it takes.
        if (KuitoViewFactory.pages[kind]?.let { it != parentNode?.kind } == true) {
            throw KuitoRenderError.InvalidTree("$kind $label cannot go in ${if (parent == 0) "the root" else describe(parent)}")
        }

        val style = KuitoViewStyle(kind, label, layout, KuitoViewFactory.props(kind))

        style.parent = parent
        nodes[id] = style

        // A host shows its children itself, each a layout root of its own: a list's rows, a container's pages.
        parentNode?.host?.let { host ->
            if (flattened) throw KuitoRenderError.InvalidTree("$kind $label cannot be flattened in ${describe(parent)}")

            layout.inheritFrom(parentLayout(parent))

            return host.adopt(makeView(id, style), label, null)
        }

        if (!flattened) makeView(id, style)

        // A sheet is presented, not placed: it is a layout root of its own.
        if (style.sheet != null) return layout.inheritFrom(parentLayout(parent))

        insertNode(layout, parent, null)
        place(layout, host(style.parent))
    }

    /**
     * A flattened node gives up its view (true) or gets one (false). Its
     * children keep their views, order and frames either way.
     */
    fun setFlattened(id: Int, flattened: Boolean) {
        if (KuitoCost.Counts.ENABLED) KuitoCost.Counts.recordsApplied++
        val style = node(id)
        val target = host(style.parent)

        if (flattened) {
            val view = style.view ?: throw KuitoRenderError.InvalidTree("${describe(id)} is flattened already")

            style.view = null
            style.content = null
            gestures.dropHandlersForView(view)
            style.layout.children.forEach { place(it, target) }
            detach(view)
        } else {
            if (style.view != null) throw KuitoRenderError.InvalidTree("${describe(id)} is not flattened")

            val view = makeView(id, style)

            place(style.layout, target)
            (style.content ?: view as? ViewGroup)?.let { content -> style.layout.children.forEach { place(it, content) } }
        }

        target.requestLayout()
    }

    /** Unsupported props are errors: the host batch was typed and checked against the manifest first. */
    fun setProperty(id: Int, key: Int, name: String, typed: KuitoValue) {
        val style = animatable(id)
        val disturbsLayout = key == KuitoMutations.NAMED_PROP || KuitoProps.effectByKey[key] != KuitoPropEffect.Paint

        if (KuitoCost.Counts.ENABLED) count(typed, name, style)
        // The kernel sends a flattened node layout props only.
        val view = style.view ?: return when {
            style.driven -> style.layout.run { change(key, typed); relayOut(host(style.parent)) }
            !disturbsLayout -> Unit
            else -> style.layout.set(key, typed).also { host(style.parent).requestLayout() }
        }

        val context = KuitoPropertyContext(id, key, name, view, style.content ?: view, style, density, events, keyboard, gestures)
        val set = setter(style, key, name) ?: context.unsupportedProp()

        try {
            set(context, typed)
        } catch (rejection: KuitoRenderError.Rejection) {
            context.unsupportedValue(typed, rejection.reason)
        }

        if (style.exited && style.exiting == KuitoExiting.Animated) {
            exited(id, style)
            return detach(view)
        }
        // A driven prop changes every frame: no update highlighting.
        if (!style.driven) onUpdate?.invoke(view)
    }

    /** A prop the UI thread drives frame by frame (docs/motion.md), without update highlighting. */
    fun setDrivenProperty(id: Int, key: Int, name: String, value: KuitoValue) {
        val style = animatable(id)

        style.driven = true
        try {
            setProperty(id, key, name, value)
        } finally {
            style.driven = false
        }
    }

    /** A record applied, and whether it writes the value the view has ([KuitoCost]). */
    private fun count(value: KuitoValue, name: String, style: KuitoViewStyle) {
        KuitoCost.Counts.recordsApplied++
        KuitoCost.Counts.propWrites++

        // A list's keys are edits, never a value to compare.
        val written = style.written ?: return

        if (value is KuitoValue.Keys) return
        if (written[name] == value) KuitoCost.Counts.wastedPropWrites++

        written[name] = value
    }

    /** A module view's own prop first, then the shared tables by key. */
    private fun setter(style: KuitoViewStyle, key: Int, name: String): KuitoPropertySetter? =
        (if (style.props.isEmpty()) null else style.props[name])
            ?: if (key == KuitoMutations.NAMED_PROP) null else KuitoProperties.byKey[key]

    /** A one-shot instruction: focus, dismiss the keyboard, announce. Id 0 addresses the app rather than one view. */
    fun command(id: Int, name: String, argument: String) {
        if (KuitoCost.Counts.ENABLED) KuitoCost.Counts.recordsApplied++
        val target = if (id == 0) "the app" else describe(id)
        val run = KuitoCommands.all[name] ?: throw KuitoRenderError.UnsupportedProp(name, target)
        val view = if (id == 0) null else node(id).view ?: throw KuitoRenderError.MissingView(target)

        try {
            run(KuitoCommandContext(name, view, target, argument, root, keyboard, accessibility, devtools) { nodes[it]?.view })
        } catch (rejection: KuitoRenderError.Rejection) {
            throw KuitoRenderError.UnsupportedValue(name, KuitoValue.Text(argument).quoted, target, rejection.reason)
        }
    }

    /** The views inside [root] with a sharedId, by it; of two with one id, the first created. */
    fun sharedElements(root: View): Map<String, View> {
        val shared = mutableMapOf<String, View>()

        for (node in nodes.toSortedMap().values) {
            if (node.exiting != null) continue

            val sharedId = node.sharedId ?: continue
            val view = node.view ?: continue

            if (sharedId !in shared && view.isInside(root)) shared[sharedId] = view
        }

        return shared
    }

    private fun View.isInside(root: View): Boolean {
        var candidate: View? = this

        while (candidate != null) {
            if (candidate === root) return true
            candidate = candidate.parent as? View
        }

        return false
    }

    /**
     * Every view the batches built, one line each in id order: its kind, its
     * parent, the frame the layout engine gave it in dp, and a text view's
     * text. A list row's frame is left out: the platform lays a row out when
     * its list shows it, which follows the list's own scrolling, not the
     * batches. A headless replay of the recording prints the same lines
     * (docs/devtools.md#recording-and-replay).
     */
    fun describeTree(): String = nodes.filterValues { it.exiting == null }.toSortedMap().entries.joinToString("\n") { (id, style) ->
        val dp = { value: Float -> String.format(java.util.Locale.ROOT, "%.1f", value) }
        val view = style.view
        val inRow = generateSequence(style) { nodes[it.parent] }.any { it.kind == "ListCell" }
        val frame = if (inRow) "in a list row" else style.layout.box().let {
            "${dp(it.x)},${dp(it.y)} ${dp(it.width)}x${dp(it.height)}"
        }

        "$id ${style.kind} in ${style.parent} $frame" +
            (if (view == null) " layout-only" else "") +
            ((view as? android.widget.TextView)?.text?.let { " \"$it\"" } ?: "")
    }

    /** The number of the Kuito view that is [view] or contains it. */
    fun idContaining(view: View): Int? {
        var candidate: View? = view

        while (candidate != null) {
            val current = candidate

            nodes.entries.firstOrNull { it.value.exiting == null && it.value.view === current }?.let { return it.key }
            candidate = current.parent as? View
        }

        return null
    }

    /**
     * The Kuito view at a screen point: the deepest visible one, whether or
     * not it takes touches, so a label picks as well as a button (the
     * devtools' Select on device). Views the platform adds are looked through.
     */
    fun idAt(x: Float, y: Float): Int? {
        val drawn = nodes.entries.filter { it.value.exiting == null }.mapNotNull { (id, style) -> style.view?.let { it to id } }.toMap()

        fun deepest(view: View): Int? {
            if (view.visibility != View.VISIBLE || view.alpha <= 0.01f) return null

            val at = IntArray(2).also(view::getLocationOnScreen)

            if (x < at[0] || y < at[1] || x >= at[0] + view.width || y >= at[1] + view.height) return null

            if (view is ViewGroup)
                for (index in view.childCount - 1 downTo 0)
                    deepest(view.getChildAt(index))?.let { return it }

            return drawn[view]
        }

        return deepest(root)
    }

    /** The views the app draws into. */
    val surface: View get() = root

    fun moveView(id: Int, parent: Int, index: Int) {
        if (KuitoCost.Counts.ENABLED) KuitoCost.Counts.recordsApplied++
        val style = node(id)
        val layout = style.layout

        // A host's child changes place among its host's children only.
        nodes[style.parent]?.host?.let { host ->
            if (parent != style.parent) throw KuitoRenderError.InvalidTree("${describe(id)} cannot leave ${describe(style.parent)}")

            return host.move(style.view ?: throw KuitoRenderError.MissingView(describe(id)), index)
        }

        // A sheet stays presented; only the parent in Kuito's tree changes.
        if (style.sheet != null) {
            style.parent = parent
            layout.inheritFrom(parentLayout(parent))

            return
        }

        layout.removeFromParent()
        insertNode(layout, parent, index)
        style.parent = parent
        place(layout, host(style.parent))
    }

    /**
     * The view leaves Kuito's tree immediately; an `exit` keeps it on screen
     * until the UI thread has animated it out. Children are removed before their parent, so a
     * child under an exiting ancestor waits for the rest of the batch and then
     * leaves with that ancestor.
     */
    fun removeView(id: Int) {
        if (KuitoCost.Counts.ENABLED) KuitoCost.Counts.recordsApplied++
        val style = node(id)

        KuitoModuleViews.unmount(id)
        val exitingAncestor = ancestorWithExiting(style.parent)
        val target = host(style.parent)

        // A flattened node's children were removed before it.
        val view = style.view ?: return style.layout.release().also {
            nodes.remove(id)
            target.requestLayout()
        }

        // An exiting view stays on screen but no longer takes gestures.
        gestures.dropHandlersForView(view)

        // The dismissal animation owns the sheet's view from here.
        style.sheet?.let { sheet ->
            nodes.remove(id)
            sheet.gestures?.release()
            sheet.dismissFromApp()
            style.layout.release()

            return
        }

        // The host owns the view from here, through any transition out; the
        // view is laid out until it has gone, so its node lives until then.
        nodes[style.parent]?.host?.let { host ->
            style.exiting = KuitoExiting.Transition

            return host.release(view) { exited(id, style) }
        }

        root.requestLayout()

        // The UI thread animates its exit and says when it may go.
        if (style.exit) {
            style.exiting = KuitoExiting.Animated
            view.isEnabled = false

            return
        }

        nodes.remove(id)

        if (exitingAncestor == null) {
            style.layout.release()

            return detach(view)
        }

        container.post {
            val ancestor = nodes[exitingAncestor]

            if (ancestor?.exiting != null) {
                // It leaves with its ancestor, laid out as part of it until then.
                ancestor.followers += style.layout
            } else {
                style.layout.release()
                detach(view)
            }
        }
    }

    /** A view in Kuito's tree; a removed one still leaving is not. */
    private fun node(id: Int): KuitoViewStyle =
        nodes[id]?.takeIf { it.exiting == null } ?: throw KuitoRenderError.MissingView(describe(id))

    /** A view that takes props: one in the tree, or one the UI thread is animating out. */
    private fun animatable(id: Int): KuitoViewStyle =
        nodes[id]?.takeIf { it.exiting != KuitoExiting.Transition } ?: throw KuitoRenderError.MissingView(describe(id))

    /**
     * An exiting view has gone: its record and node, and those of the views
     * that left with it, go too. After clear() its number may name another view.
     */
    private fun exited(id: Int, style: KuitoViewStyle) {
        if (nodes[id] === style) nodes.remove(id)
        style.followers.forEach(KuitoLayoutNode::release)
        style.followers.clear()
        style.layout.release()
    }

    /** Makes the node's view and records it; the caller places it. */
    private fun makeView(id: Int, style: KuitoViewStyle): View {
        val view = KuitoViewFactory.create(context, style.kind, id, events)

        if (KuitoCost.Counts.ENABLED) KuitoCost.Counts.viewsCreated++
        val content = (view as? KuitoScrolling)?.content
        val layout = style.layout

        style.view = view
        style.content = content

        // Like CSS and UIKit, children draw outside their parent (scaled cards,
        // shadows) unless `overflow: hidden`; Android clips by default. A scroll
        // view still clips its scrolled content to its frame, as `overflow:
        // scroll` and UIScrollView do; inside it, children may overflow.
        if (content == null) (view as? ViewGroup)?.unclip()
        content?.unclip()
        (content ?: view as? KuitoFlexLayout)?.node = layout

        style.host = view as? KuitoHost
        (view as? KuitoStyled)?.style(style, links)
        onUpdate?.invoke(view)

        return view
    }

    /** The node joins its parent's layout at [index]. */
    private fun insertNode(layout: KuitoLayoutNode, parent: Int, index: Int?) {
        val parentLayout = parentLayout(parent)
        val count = parentLayout.children.size

        parentLayout.insert(layout, (index ?: count).coerceIn(0, count))
    }

    private fun parentLayout(parent: Int) = if (parent == 0) root.root else node(parent).layout

    /** The group that holds a node's view: its nearest ancestor with one (a ScrollView's content), or the root. */
    private fun host(parent: Int): ViewGroup {
        var current = parent

        while (current != 0) {
            val ancestor = node(current)

            (ancestor.content ?: ancestor.view as? ViewGroup)?.let { return it }

            current = ancestor.parent
        }

        return root
    }

    /** Puts the node's view into [group] in tree order; a flattened node puts its children's views. */
    private fun place(node: KuitoLayoutNode, group: ViewGroup) {
        val view = node.view ?: return node.children.forEach { place(it, group) }
        val next = nextView(node, group)
        val index = next?.let(group::indexOfChild) ?: group.childCount

        // Re-adding a view in place would only relayout it (and drop its focus).
        if (view.parent === group && group.getChildAt(index - 1) === view) return

        detach(view)
        group.addView(view, next?.let(group::indexOfChild) ?: group.childCount)
    }

    /** The first view in [group] that follows the node in tree order, looking through flattened ancestors. */
    private fun nextView(node: KuitoLayoutNode, group: ViewGroup): View? {
        var current = node

        while (true) {
            val parent = current.parent ?: return null
            val siblings = parent.children

            for (sibling in siblings.drop(siblings.indexOf(current) + 1)) firstView(sibling, group)?.let { return it }

            if (parent.view != null) return null

            current = parent
        }
    }

    private fun firstView(node: KuitoLayoutNode, group: ViewGroup): View? {
        node.view?.let { return it.takeIf { it.parent === group } }

        return node.children.firstNotNullOfOrNull { firstView(it, group) }
    }

    private fun detach(view: View) {
        (view.parent as? ViewGroup)?.removeView(view)
    }

    /** The nearest ancestor that may stay on screen once removed: an `exit`, or a container's transition out. */
    private fun ancestorWithExiting(parent: Int): Int? {
        var current = parent

        while (current != 0) {
            val style = nodes[current] ?: return null

            if (style.exit) return current

            val view = style.view

            if (view != null && nodes[style.parent]?.host?.animatesRemoval(view) == true) return current

            current = style.parent
        }

        return null
    }

    /** A view as errors name it: its label and number. */
    /** The view as errors and frame receipts name it: its kind, label and number. */
    fun describe(id: Int) = nodes[id]?.described(id) ?: id.toString()

    private fun ViewGroup.unclip() {
        clipChildren = false
        clipToPadding = false
    }
}
