import UIKit

/// What the performance monitor shows of Kuito commits: prop parses per
/// commit, and how long a touch waits for the app's first applied mutation
/// (the latency synchronous input commits would cut).
@MainActor
enum KuitoCommitStats {
    /// A touch no batch answers within this long sent nothing to apply.
    private static let unanswered: CFTimeInterval = 5
    private static let samples = 64

    private(set) static var commits = 0
    private(set) static var parses = 0
    private static var touchedAt: CFTimeInterval?
    private static var latencies: [CFTimeInterval] = []

    /// Touch-to-applied latency of the last answered touch, in seconds.
    static var lastLatency: CFTimeInterval? { latencies.last }

    /// Over the last `samples` answered touches.
    static var p95Latency: CFTimeInterval? {
        let sorted = latencies.sorted()

        return sorted.isEmpty ? nil : sorted[(sorted.count * 95 + 99) / 100 - 1]
    }

    /// A touch began or ended at `time` (`CACurrentMediaTime`'s clock): the next batch the app sends answers it.
    static func touched(at time: CFTimeInterval) {
        touchedAt = time
    }

    /// Launched with `KUITO_COMMIT_LOG=1`: each commit logs a `KuitoCommit` line
    /// for scripts/benchmark-commits.ts.
    private static let logging = ProcessInfo.processInfo.environment["KUITO_COMMIT_LOG"] == "1"

    /// Applies a batch the JS thread sent at `sentAt` in `hostCalls` calls, counting its parses and the touch it answers.
    static func commit(sentAt: CFTimeInterval, records: Int, hostCalls: Int, _ apply: () -> Void) {
        let before = KuitoParses.count
        let started = CACurrentMediaTime()

        apply()
        commits += 1
        parses += KuitoParses.count - before

        if logging {
            NSLog(
                "KuitoCommit records=%ld calls=%ld ms=%.3f parses=%ld", records, hostCalls,
                (CACurrentMediaTime() - started) * 1000, KuitoParses.count - before
            )
        }

        guard let touch = touchedAt, sentAt >= touch else { return }

        touchedAt = nil

        if sentAt - touch <= unanswered {
            latencies.append(CACurrentMediaTime() - touch)
            latencies = Array(latencies.suffix(samples))
        }
    }
}

/// The app's window: it times every touch before any view sees it, and
/// reports its size and safe area after each layout (docs/window.md).
final class KuitoWindow: UIWindow {
    override func layoutSubviews() {
        super.layoutSubviews()
        KuitoWindowMetrics.shared.update(self)
    }

    override func safeAreaInsetsDidChange() {
        super.safeAreaInsetsDidChange()
        KuitoWindowMetrics.shared.update(self)
    }

    override func sendEvent(_ event: UIEvent) {
        if event.type == .touches,
           event.allTouches?.contains(where: { $0.phase == .began || $0.phase == .ended }) == true {
            KuitoCommitStats.touched(at: event.timestamp)
        }

        super.sendEvent(event)
    }
}
