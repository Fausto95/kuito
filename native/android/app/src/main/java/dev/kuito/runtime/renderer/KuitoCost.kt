package dev.kuito.runtime.renderer

import dev.kuito.runtime.BuildConfig
import dev.kuito.runtime.renderer.layout.KuitoLayoutNode

/**
 * The main thread's work in counts (docs/performance.md#cost-counters): what
 * a renderer test budgets an interaction by, as `costOf` does headlessly,
 * and what the wasted-work counts find work that changed nothing with.
 * Debug builds only: R8 drops every count behind [ENABLED] in release.
 */
internal data class KuitoCost(
    val recordsApplied: Long = 0,
    val propWrites: Long = 0,
    /** Prop writes of the value the view already had. */
    val wastedPropWrites: Long = 0,
    /** Engine passes over a layout root's tree. */
    val layoutPasses: Long = 0,
    /** Passes that changed no box. */
    val wastedLayoutPasses: Long = 0,
    /** Nodes the engine computed rather than took from its cache. */
    val nodesLaidOut: Long = 0,
    /** Views a layout placed. */
    val nodesFramed: Long = 0,
    /** Views placed where they were. */
    val wastedFrames: Long = 0,
    /** Leaves measured: each a miss of the engine's measure cache. */
    val measureCalls: Long = 0,
    /** Measures that answered what the leaf measured before it was marked dirty. */
    val wastedMeasures: Long = 0,
    val labelRedraws: Long = 0,
    /** Redraws of the text, size and padding the label last drew. */
    val wastedRedraws: Long = 0,
    val viewsCreated: Long = 0,
) {
    /** Each counter's growth since [before]. */
    operator fun minus(before: KuitoCost) = KuitoCost(
        recordsApplied - before.recordsApplied,
        propWrites - before.propWrites,
        wastedPropWrites - before.wastedPropWrites,
        layoutPasses - before.layoutPasses,
        wastedLayoutPasses - before.wastedLayoutPasses,
        nodesLaidOut - before.nodesLaidOut,
        nodesFramed - before.nodesFramed,
        wastedFrames - before.wastedFrames,
        measureCalls - before.measureCalls,
        wastedMeasures - before.wastedMeasures,
        labelRedraws - before.labelRedraws,
        wastedRedraws - before.wastedRedraws,
        viewsCreated - before.viewsCreated,
    )

    /** The renderer's counts, kept on the main thread. */
    internal object Counts {
        @JvmField val ENABLED = BuildConfig.DEBUG

        var recordsApplied = 0L
        var propWrites = 0L
        var wastedPropWrites = 0L
        var layoutPasses = 0L
        var wastedLayoutPasses = 0L
        var nodesFramed = 0L
        var wastedFrames = 0L
        var labelRedraws = 0L
        var wastedRedraws = 0L
        var viewsCreated = 0L
    }

    companion object {
        /** The counts since launch: the renderer's, and the engine's. */
        val total: KuitoCost
            get() {
                val engine = KuitoLayoutNode.cost()

                return with(Counts) {
                    KuitoCost(
                        recordsApplied, propWrites, wastedPropWrites, layoutPasses, wastedLayoutPasses,
                        engine[0], nodesFramed, wastedFrames, engine[1], engine[2],
                        labelRedraws, wastedRedraws, viewsCreated,
                    )
                }
            }
    }
}
