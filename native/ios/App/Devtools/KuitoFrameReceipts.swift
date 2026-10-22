import UIKit

/// Frame receipts in a development build (docs/performance.md#frame-receipts):
/// tells the ledger when the main thread wakes and sleeps, where Core
/// Animation's commit runs and when each display frame comes, and reports a
/// frame that dropped with what ran in it and why.
@MainActor
final class KuitoFrameReceipts {
    /// Each display frame: its vsync, the display's interval and the verdict.
    var onFrame: ((Double, Double, KuitoFrameVerdict) -> Void)?
    /// A dropped frame, as one line, and whether it is worth a warning: one
    /// that Kuito's work took the time of, a second or more after the last
    /// warning. The others are logged only, so a drop the LogBox's own
    /// presentation causes cannot feed itself.
    var onDrop: ((String, Bool) -> Void)?
    /// Names a view in a report by its number.
    var nameView: (UInt32) -> String = { "view \($0)" }

    private var link: CADisplayLink?
    private var observers: [CFRunLoopObserver] = []
    private var reported: UInt64 = 0
    private var commitStarted: Double?
    private var warned = -Double.infinity

    /// Core Animation commits at this order before the run loop sleeps.
    private static let commitOrder: CFIndex = 2_000_000

    func start() {
        guard link == nil else { return }

        let link = CADisplayLink(target: self, selector: #selector(tick(_:)))
        // The main run loop is awake while the thread works and asleep while
        // it waits for the next event or frame: its awake time is the work.
        // Woken first and asleep last, after UIKit's layout and Core
        // Animation's commit, which run on the way to sleep.
        let observers = [
            observer(.afterWaiting, order: CFIndex.min) { _ in KuitoFrameLedger.woke() },
            observer(.beforeWaiting, order: Self.commitOrder - 1) { receipts in receipts.commitStarted = KuitoFrameLedger.now },
            observer(.beforeWaiting, order: Self.commitOrder + 1) { receipts in
                guard let started = receipts.commitStarted else { return }

                receipts.commitStarted = nil
                KuitoFrameLedger.recordCommit(from: started)
            },
            observer(.beforeWaiting, order: CFIndex.max) { _ in KuitoFrameLedger.slept() },
        ]

        observers.forEach { CFRunLoopAddObserver(CFRunLoopGetMain(), $0, .commonModes) }
        link.add(to: .main, forMode: .common)
        self.link = link
        self.observers = observers
        reported = KuitoFrameLedger.dropSequence
        KuitoFrameLedger.woke()
    }

    func stop() {
        link?.invalidate()
        link = nil
        observers.forEach { CFRunLoopRemoveObserver(CFRunLoopGetMain(), $0, .commonModes) }
        observers = []
    }

    private func observer(
        _ activity: CFRunLoopActivity, order: CFIndex, record: @escaping (KuitoFrameReceipts) -> Void
    ) -> CFRunLoopObserver {
        CFRunLoopObserverCreateWithHandler(nil, activity.rawValue, true, order) { [weak self] _, _ in
            MainActor.assumeIsolated {
                guard let self else { return }

                record(self)
            }
        }
    }

    /// A view as a report names it: its kind, the app's id for it when it
    /// has one (a generated label says nothing to the reader), and its number.
    static func name(_ id: UInt32, kind: String, label: String) -> String {
        label.hasPrefix("__kuito:") ? "\(kind) (\(id))" : "\(kind) \(label) (\(id))"
    }

    @objc private func tick(_ link: CADisplayLink) {
        let interval = link.targetTimestamp - link.timestamp
        let verdict = KuitoFrameLedger.frame(vsync: link.timestamp, interval: interval)

        onFrame?(link.timestamp, interval, verdict)

        guard KuitoFrameLedger.dropSequence != reported else { return }

        reported = KuitoFrameLedger.dropSequence

        let warn = KuitoFrameLedger.lastDropReceipted && link.timestamp - warned >= 1

        if warn { warned = link.timestamp }
        onDrop?(KuitoFrameLedger.describeLastDrop(nameView), warn)
    }
}
