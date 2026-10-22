import os
import QuartzCore
import UIKit

/// Cost replay (docs/devtools.md#cost-replay): a recording's batches applied
/// to the real renderer on the main thread with no JS, each on the first
/// display frame at or after the time its runtime sent it, then laid out as
/// the frame's commit would. What a frame costs here is the renderer and
/// layout share of the frame the device drew. The replay also counts its
/// work (docs/performance.md#cost-counters) and keeps the receipts of the
/// frames it dropped (#frame-receipts), by the rule the shells report drops by.
@MainActor
final class KuitoCostReplay: NSObject {
    /// A display frame that applied batches: how many, and what applying and laying them out took.
    struct Frame {
        let batches: Int
        let records: Int
        /// Seconds.
        let work: Double
    }

    struct Report {
        let name: String
        let frames: [Frame]
        /// The display's frame interval while replaying, in seconds.
        let interval: Double
        /// The work the replay did, in counts.
        let cost: KuitoCost
        /// Display frames dropped while it worked past one.
        let dropped: Int
        /// Each drop Kuito's work took the time of, as its receipts describe it.
        let drops: [String]

        var batches: Int { frames.reduce(0) { $0 + $1.batches } }
        var records: Int { frames.reduce(0) { $0 + $1.records } }
        /// Frames whose work alone outlasted the display's interval.
        var overBudget: Int { frames.filter { $0.work > interval }.count }

        /// The frame work at `percent`, nearest rank, in seconds.
        func percentile(_ percent: Double) -> Double {
            let sorted = frames.map(\.work).sorted()

            guard !sorted.isEmpty else { return 0 }

            return sorted[min(sorted.count - 1, Int((percent / 100 * Double(sorted.count)).rounded(.up)) - 1)]
        }

        /// One line scripts/bisect-frame-cost.ts reads; times in milliseconds.
        var line: String {
            let ms = { (seconds: Double) in String(format: "%.2f", seconds * 1000) }

            return "kuito-cost-replay ios \(name) batches=\(batches) records=\(records) frames=\(frames.count) "
                + "p50=\(ms(percentile(50))) p95=\(ms(percentile(95))) max=\(ms(percentile(100))) "
                + "over=\(overBudget) interval=\(ms(interval)) dropped=\(dropped) "
                + Mirror(reflecting: cost).children.compactMap { child in child.label.map { "\($0)=\(child.value)" } }
                .joined(separator: " ")
        }
    }

    private static let signposter = OSSignposter(subsystem: "dev.kuito.tests", category: .pointsOfInterest)

    /// A development build's recording carries devtools commands: the replay
    /// takes them as a shell with update highlights off does, drawing nothing.
    private final class Devtools: KuitoDevtoolsOverlay {
        func highlight(_ views: [UIView]) {}
        func inspect(_ enabled: Bool) {}
        func hello() {}
        func cause(_ view: UIView, _ text: String) {}
    }

    private let devtools = Devtools()
    private let renderer: KuitoUIKitRenderer
    private let container: UIView
    private let batches: [KuitoReplayBatch]
    private let name: String
    private var next = 0
    private var start: CFTimeInterval?
    private var frames: [Frame] = []
    private var interval: Double = 0
    private var link: CADisplayLink?
    private let before = KuitoCost.total
    private var ticked = false
    private var dropped = 0
    private var drops: [String] = []
    private var finished: CheckedContinuation<Report, Error>?

    private init(_ name: String, _ batches: [KuitoReplayBatch], renderer: KuitoUIKitRenderer, container: UIView) {
        self.name = name
        self.batches = batches
        self.renderer = renderer
        self.container = container
        renderer.devtools = devtools
        KuitoFrameLedger.reset()
    }

    /// Replays `batches` into `renderer`, whose views lay out in `container`.
    /// A record the renderer refuses ends the replay with its error.
    static func run(
        _ name: String, _ batches: [KuitoReplayBatch], renderer: KuitoUIKitRenderer, container: UIView
    ) async throws -> Report {
        let replay = KuitoCostReplay(name, batches, renderer: renderer, container: container)

        return try await withCheckedThrowingContinuation { continuation in
            replay.finished = continuation
            let link = CADisplayLink(target: replay, selector: #selector(tick))

            replay.link = link
            link.add(to: .main, forMode: .common)
        }
    }

    @objc private func tick(_ link: CADisplayLink) {
        interval = link.targetTimestamp - link.timestamp
        closeFrame(vsync: link.timestamp)

        // The frame after the last batch's only closes it.
        if next == batches.count { return finish(.success(report)) }

        let now = CACurrentMediaTime()
        let first = batches.first?.ms ?? 0

        if start == nil { start = now }

        let elapsed = (now - (start ?? now)) * 1000
        let began = CACurrentMediaTime()
        let state = Self.signposter.beginInterval("Kuito replay frame")
        var applied = 0
        var records = 0

        KuitoFrameLedger.woke()
        defer {
            KuitoFrameLedger.slept()
            Self.signposter.endInterval("Kuito replay frame", state)
        }

        do {
            while next < batches.count, batches[next].ms - first <= elapsed {
                let batch = batches[next].batch

                for record in UnsafeBufferPointer(start: batch.records, count: batch.count) {
                    try renderer.apply(record)
                }

                applied += 1
                records += batch.count
                next += 1
            }

            if applied > 0 { container.layoutIfNeeded() }
        } catch {
            return finish(.failure(error))
        }

        if applied > 0 { frames.append(Frame(batches: applied, records: records, work: CACurrentMediaTime() - began)) }
    }

    /// The frame rule's verdict on the frame before the vsync at `vsync`.
    private func closeFrame(vsync: Double) {
        let verdict = KuitoFrameLedger.frame(vsync: vsync, interval: interval)

        defer { ticked = true }

        guard ticked, verdict.dropped > 0 else { return }

        dropped += verdict.dropped
        if KuitoFrameLedger.lastDropReceipted {
            drops.append(KuitoFrameLedger.describeLastDrop { [renderer] id in renderer.describe(id) })
        }
    }

    private var report: Report {
        Report(
            name: name, frames: frames, interval: interval, cost: KuitoCost.between(before, KuitoCost.total),
            dropped: dropped, drops: drops
        )
    }

    private func finish(_ result: Result<Report, Error>) {
        link?.invalidate()
        link = nil
        finished?.resume(with: result)
        finished = nil
    }
}
