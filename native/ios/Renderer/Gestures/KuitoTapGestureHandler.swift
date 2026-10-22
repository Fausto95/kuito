// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/apple/Handlers/RNTapHandler.m),
// MIT License, Copyright (c) 2016 Software Mansion.

import UIKit
import UIKit.UIGestureRecognizerSubclass

// KuitoBetterTapGestureRecognizer extends UIGestureRecognizer instead of UITapGestureRecognizer
// because the latter does not allow for parameters like maxDelay, maxDuration, minPointers,
// maxDelta to be configured. Using our custom implementation of tap recognizer we are able
// to support these.
@MainActor
final class KuitoBetterTapGestureRecognizer: UIGestureRecognizer {
    static let defaultNumberOfTaps = 1
    static let defaultMinPointers = 1
    static let defaultMaxDelay: TimeInterval = 0.2
    static let defaultMaxDuration: TimeInterval = 0.5

    weak var gestureHandler: KuitoGestureHandler?
    var numberOfTaps = defaultNumberOfTaps
    var maxDelay = defaultMaxDelay
    var maxDuration = defaultMaxDuration
    var maxDistSq = CGFloat.nan
    var maxDeltaX = CGFloat.nan
    var maxDeltaY = CGFloat.nan
    var minPointers = defaultMinPointers
    private var tapsSoFar = 0
    private var initPosition = CGPoint.zero
    private var maxNumberOfTouches = 0
    // Pending `cancel` invocations. Dispatch work items rather than timers or perform(afterDelay:),
    // which run in the default run loop mode only and so are starved while a sibling UIScrollView
    // keeps the run loop in tracking mode (during a drag or momentum deceleration). The main queue
    // runs them regardless of run loop mode, so the tap can still fail on time while a list scrolls.
    private var pendingCancellations: [DispatchWorkItem] = []

    init() {
        super.init(target: nil, action: nil)
    }

    private func scheduleCancel(after delay: TimeInterval) {
        let cancellation = DispatchWorkItem { [weak self] in
            MainActor.assumeIsolated { self?.cancel() }
        }

        pendingCancellations.append(cancellation)
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: cancellation)
    }

    private func cancelPendingCancellations() {
        pendingCancellations.forEach { $0.cancel() }
        pendingCancellations.removeAll()
    }

    private func triggerAction() {
        gestureHandler?.handleGesture(self, fromReset: false)
    }

    private func triggerActionFromReset() {
        gestureHandler?.handleGesture(self, fromReset: true)
    }

    private func cancel() {
        isEnabled = false
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        gestureHandler?.setCurrentPointerType(for: event)
        super.touchesBegan(touches, with: event)

        if state == .possible, gestureHandler?.gestureRecognizerShouldBegin(self) != true {
            state = .failed
            return
        }

        if tapsSoFar == 0 {
            // This recognizer sends UNDETERMINED -> BEGAN state change event before gestureRecognizerShouldBegin
            // is called (it resets the gesture handler), making it send whatever the last known state as oldState
            // in the event. If we reset it here it correctly sends UNDETERMINED as oldState.
            gestureHandler?.reset()
            initPosition = location(in: view?.window)
        }

        tapsSoFar += 1
        cancelPendingCancellations()
        maxNumberOfTouches = max(maxNumberOfTouches, touches.count)

        if !maxDuration.isNaN { scheduleCancel(after: maxDuration) }

        state = .possible
        triggerAction()
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesMoved(touches, with: event)
        maxNumberOfTouches = max(maxNumberOfTouches, touches.count)

        guard state == .possible else { return }

        if shouldFailUnderCustomCriteria() {
            state = .failed
            return
        }

        state = .possible
        triggerAction()
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesEnded(touches, with: event)
        cancelPendingCancellations()

        if numberOfTaps == tapsSoFar && maxNumberOfTouches >= minPointers {
            state = .ended
        } else {
            scheduleCancel(after: maxDelay)
        }
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesCancelled(touches, with: event)
        state = .cancelled
        triggerAction()
    }

    private func translation() -> CGPoint {
        let currentPosition = location(in: view?.window)

        return CGPoint(x: currentPosition.x - initPosition.x, y: currentPosition.y - initPosition.y)
    }

    private func shouldFailUnderCustomCriteria() -> Bool {
        if let handler = gestureHandler, handler.shouldCancelWhenOutside, !handler.containsPointInView() {
            return true
        }

        let trans = translation()

        if KuitoGestureCriteria.exceedsMax(abs(trans.x), maxDeltaX) { return true }
        if KuitoGestureCriteria.exceedsMax(abs(trans.y), maxDeltaY) { return true }
        if KuitoGestureCriteria.exceedsMax(KuitoGestureCriteria.lengthSquared(trans), maxDistSq) { return true }

        return false
    }

    override func reset() {
        triggerActionFromReset()
        cancelPendingCancellations()
        tapsSoFar = 0
        maxNumberOfTouches = 0
        isEnabled = gestureHandler?.enabled ?? true
        super.reset()
        gestureHandler?.reset()
    }
}

@MainActor
final class KuitoTapGestureHandler: KuitoGestureHandler {
    static let configKeys = commonConfigKeys.merging([
        "numberOfTaps": .integer, "maxDurationMs": .number, "maxDelayMs": .number,
        "maxDist": .number, "maxDeltaX": .number, "maxDeltaY": .number, "minPointers": .integer,
    ]) { _, own in own }

    private let tap: KuitoBetterTapGestureRecognizer
    private var lastData: KuitoGesturePayload?

    init(tag: Int) {
        let tap = KuitoBetterTapGestureRecognizer()

        self.tap = tap
        super.init(tag: tag, recognizer: tap)
        tap.gestureHandler = self
        tap.addTarget(self, action: #selector(handleGesture(_:)))
    }

    override func resetConfig() {
        super.resetConfig()
        tap.numberOfTaps = KuitoBetterTapGestureRecognizer.defaultNumberOfTaps
        tap.minPointers = KuitoBetterTapGestureRecognizer.defaultMinPointers
        tap.maxDeltaX = .nan
        tap.maxDeltaY = .nan
        tap.maxDelay = KuitoBetterTapGestureRecognizer.defaultMaxDelay
        tap.maxDuration = KuitoBetterTapGestureRecognizer.defaultMaxDuration
        tap.maxDistSq = .nan
    }

    override func updateConfig(_ config: KuitoGestureConfig) {
        super.updateConfig(config)

        if let value = config.integer("numberOfTaps") { tap.numberOfTaps = value }
        if let value = config.integer("minPointers") { tap.minPointers = value }
        if let value = config.number("maxDeltaX") { tap.maxDeltaX = value }
        if let value = config.number("maxDeltaY") { tap.maxDeltaY = value }
        if let delay = config.number("maxDelayMs") { tap.maxDelay = delay / 1000 }
        if let duration = config.number("maxDurationMs") { tap.maxDuration = duration / 1000 }
        if let dist = config.number("maxDist") { tap.maxDistSq = dist * dist }
    }

    /// The touches have lifted when a tap ends: report where they were.
    override func eventExtraData(_ recognizer: UIGestureRecognizer) -> KuitoGesturePayload {
        if recognizer.state == .ended, let lastData { return lastData }

        let data = super.eventExtraData(recognizer)

        lastData = data

        return data
    }

    override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        // UNDETERMINED -> BEGAN state change event is sent before this method is called,
        // in KuitoGestureHandler it resets `lastState`, making it seem like handler
        // went from UNDETERMINED to BEGAN and then from UNDETERMINED to ACTIVE.
        // This way we preserve `lastState` between events and keep correct state flow.
        let savedState = lastState
        let shouldBegin = super.gestureRecognizerShouldBegin(gestureRecognizer)

        lastState = savedState

        return shouldBegin
    }
}
