import os

/// Named intervals in Instruments' Points of Interest, as KuitoTrace.kt marks
/// them on Android: `Kuito evaluate` on the JS queue, `Kuito commit <mutations>`
/// on the main thread. A trailing number is detail; benchmarks group by the rest.
/// Costs a flag check when nobody is recording.
enum KuitoTrace {
    static let signposter = OSSignposter(subsystem: "dev.kuito.shell", category: .pointsOfInterest)

    static func traced<T>(_ name: StaticString, _ detail: Int, _ block: () throws -> T) rethrows -> T {
        try signposter.withIntervalSignpost(name, "\(detail)", around: block)
    }
}
