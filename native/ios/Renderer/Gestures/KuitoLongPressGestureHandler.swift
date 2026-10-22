// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/apple/Handlers/RNLongPressHandler.m),
// MIT License, Copyright (c) 2016 Software Mansion.

import UIKit
import UIKit.UIGestureRecognizerSubclass

/// UIKit's long press, failed when the touch moves too far or leaves the view,
/// and timed so events report how long the press has lasted.
@MainActor
final class KuitoBetterLongPressGestureRecognizer: UILongPressGestureRecognizer {
    weak var gestureHandler: KuitoGestureHandler?
    private var startTime: CFTimeInterval = 0
    private var previousTime: CFTimeInterval = 0
    private var initPosition = CGPoint.zero

    init() {
        super.init(target: nil, action: nil)
        // The recognizer is its own target so every action records its time first.
        addTarget(self, action: #selector(handleGestureAction))
    }

    /// Milliseconds from touch-down to the latest action.
    var duration: Int { Int(max((previousTime - startTime) * 1000, 0)) }

    @objc private func handleGestureAction() {
        handleGesture(fromReset: false)
    }

    private func handleGesture(fromReset: Bool) {
        previousTime = CACurrentMediaTime()
        gestureHandler?.handleGesture(self, fromReset: fromReset)
    }

    private func translation() -> CGPoint {
        let currentPosition = location(in: view)

        return CGPoint(x: currentPosition.x - initPosition.x, y: currentPosition.y - initPosition.y)
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        gestureHandler?.setCurrentPointerType(for: event)
        super.touchesBegan(touches, with: event)

        if state == .possible, gestureHandler?.gestureRecognizerShouldBegin(self) != true {
            state = .failed
            return
        }

        state = .possible

        initPosition = location(in: view)
        startTime = CACurrentMediaTime()
        gestureHandler?.reset()
        handleGesture(fromReset: false)
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesMoved(touches, with: event)

        if shouldCancelGesture() {
            state = .failed
            // Toggling isEnabled makes UIKit drop the touches and reset the recognizer.
            isEnabled = false
            isEnabled = true
        }
    }

    private func shouldCancelGesture() -> Bool {
        let trans = translation()
        let shouldBeCancelledOutside = gestureHandler.map { $0.shouldCancelWhenOutside && !$0.containsPointInView() } ?? false
        let distanceExceeded = KuitoGestureCriteria.exceedsMax(
            KuitoGestureCriteria.lengthSquared(trans), allowableMovement * allowableMovement
        )

        return shouldBeCancelledOutside || distanceExceeded
    }

    override func reset() {
        handleGesture(fromReset: true)
        super.reset()
        gestureHandler?.reset()
    }
}

@MainActor
final class KuitoLongPressGestureHandler: KuitoGestureHandler {
    static let configKeys = commonConfigKeys.merging([
        "minDurationMs": .number, "maxDist": .number, "numberOfPointers": .integer,
    ]) { _, own in own }

    private let longPress: KuitoBetterLongPressGestureRecognizer

    init(tag: Int) {
        let longPress = KuitoBetterLongPressGestureRecognizer()

        self.longPress = longPress
        super.init(tag: tag, recognizer: longPress)
        longPress.gestureHandler = self
    }

    override func resetConfig() {
        super.resetConfig()
        longPress.minimumPressDuration = 0.5
        longPress.allowableMovement = 10
        longPress.numberOfTouchesRequired = 1
    }

    override func updateConfig(_ config: KuitoGestureConfig) {
        super.updateConfig(config)

        if let duration = config.number("minDurationMs") { longPress.minimumPressDuration = duration / 1000 }
        if let dist = config.number("maxDist") { longPress.allowableMovement = dist }
        if let pointers = config.integer("numberOfPointers") { longPress.numberOfTouchesRequired = pointers }
    }

    override var state: KuitoGestureState {
        // For long press recognizer we treat "Began" state as "active"
        // as it changes its state to "Began" as soon as the minimum
        // hold duration timeout is reached, whereas state "Changed" is
        // only set after "Began" phase if there is some movement.
        // A state set explicitly (CANCELLED when the view leaves mid-press) wins.
        if longPress.state == .began && super.state == .began { return .active }

        return super.state
    }

    override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        // Same as tap: keep `lastState` across the reset in the base handler.
        let savedState = lastState
        let shouldBegin = super.gestureRecognizerShouldBegin(gestureRecognizer)

        lastState = savedState

        return shouldBegin
    }

    override func eventExtraData(_ recognizer: UIGestureRecognizer) -> KuitoGesturePayload {
        var payload = extraData(
            pointers: longPress.numberOfTouches,
            at: longPress.location(in: longPress.view),
            absolute: longPress.location(in: longPress.view?.window)
        )

        payload.duration = Double(longPress.duration)

        return payload
    }
}
