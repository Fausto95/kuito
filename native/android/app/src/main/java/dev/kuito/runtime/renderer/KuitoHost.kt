package dev.kuito.runtime.renderer

import android.view.View
import dev.kuito.runtime.renderer.gestures.GestureHandlerRegistry
import dev.kuito.runtime.renderer.layout.KuitoLayoutNode
import dev.kuito.runtime.renderer.styling.KuitoViewStyle

/**
 * A view that shows its children itself instead of the layout tree placing
 * them as children: a list's rows, a navigation stack's screens, a tab bar's
 * tabs, a native module's container (docs/native-renderer.md#hosts). Each
 * child is a layout root of its own; the renderer routes its children's
 * creation, moves and removal here.
 */
internal interface KuitoHost {
    /**
     * [child] joins at [index] (null appends). [label] is the child's label,
     * how a list matches the row it asked the kernel for. A child it doesn't
     * take is an [KuitoRenderError.InvalidTree].
     */
    fun adopt(child: View, label: String, index: Int?)

    fun move(child: View, index: Int)

    /** [child] leaves the host's children at once; [gone] runs once it is off screen, after any transition. */
    fun release(child: View, gone: () -> Unit)

    /** Whether releasing [child] now would animate it out: its subtree stays until [release]'s `gone`. */
    fun animatesRemoval(child: View): Boolean
}

/** A view that keeps its record or reaches the rest of the tree: the renderer styles it once, when it makes the view. */
internal interface KuitoStyled {
    fun style(style: KuitoViewStyle, tree: KuitoTreeLinks)
}

/** What a styled view may reach of the renderer's tree. */
internal class KuitoTreeLinks(
    /** The views inside a root with a sharedId, by it (KuitoSharedTransition). */
    val sharedElements: (View) -> Map<String, View>,
    /** The gesture registry a sheet's own window routes touches through. */
    val gestures: GestureHandlerRegistry,
    /** The record a layout node belongs to: the view a sheet pads. */
    val style: (KuitoLayoutNode) -> KuitoViewStyle?,
)
