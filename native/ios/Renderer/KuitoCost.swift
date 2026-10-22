import Foundation

/// The main thread's work in counts (docs/performance.md#cost-counters): what
/// a renderer test budgets an interaction by, as `costOf` does headlessly,
/// and what the wasted-work counts find work that changed nothing with.
/// Debug builds only: in release, `add` compiles to nothing.
struct KuitoCost: Equatable {
    var recordsApplied = 0
    var propWrites = 0
    /// Prop writes of the value the view already had.
    var wastedPropWrites = 0
    /// Frame applications after a layout pass.
    var layoutPasses = 0
    /// Passes after which no view's frame changed.
    var wastedLayoutPasses = 0
    /// Nodes the engine computed rather than took from its cache.
    var nodesLaidOut = 0
    /// Views a pass set the frame of.
    var nodesFramed = 0
    /// Frames set to the one the view had.
    var wastedFrames = 0
    /// Leaves measured: each a miss of the engine's measure cache.
    var measureCalls = 0
    /// Measures that answered what the leaf measured before it was marked dirty.
    var wastedMeasures = 0
    var labelRedraws = 0
    /// Redraws of the text, size and padding the label last drew.
    var wastedRedraws = 0
    var viewsCreated = 0

    @MainActor private static var counted = KuitoCost()

    /// The counts since launch.
    @MainActor static var total: KuitoCost {
        var total = counted
        let engine = KuitoLayoutNode.cost

        total.nodesLaidOut = Int(engine.nodesLaidOut)
        total.measureCalls = Int(engine.measureCalls)
        total.wastedMeasures = Int(engine.wastedMeasures)

        return total
    }

    @MainActor @inline(__always)
    static func add(_ counter: WritableKeyPath<KuitoCost, Int>, _ count: Int = 1) {
        #if DEBUG
            counted[keyPath: counter] += count
        #endif
    }

    /// Each counter's growth from `before` to `after`.
    static func between(_ before: KuitoCost, _ after: KuitoCost) -> KuitoCost {
        KuitoCost(
            recordsApplied: after.recordsApplied - before.recordsApplied,
            propWrites: after.propWrites - before.propWrites,
            wastedPropWrites: after.wastedPropWrites - before.wastedPropWrites,
            layoutPasses: after.layoutPasses - before.layoutPasses,
            wastedLayoutPasses: after.wastedLayoutPasses - before.wastedLayoutPasses,
            nodesLaidOut: after.nodesLaidOut - before.nodesLaidOut,
            nodesFramed: after.nodesFramed - before.nodesFramed,
            wastedFrames: after.wastedFrames - before.wastedFrames,
            measureCalls: after.measureCalls - before.measureCalls,
            wastedMeasures: after.wastedMeasures - before.wastedMeasures,
            labelRedraws: after.labelRedraws - before.labelRedraws,
            wastedRedraws: after.wastedRedraws - before.wastedRedraws,
            viewsCreated: after.viewsCreated - before.viewsCreated
        )
    }
}
