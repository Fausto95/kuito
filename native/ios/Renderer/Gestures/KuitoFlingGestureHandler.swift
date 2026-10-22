// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/apple/Handlers/RNFlingHandler.m and
// RNGestureHandlerDirection.h), MIT License, Copyright (c) 2016 Software Mansion.

import UIKit
import UIKit.UIGestureRecognizerSubclass

/// UIKit's swipe, sending BEGAN on touch-down and remembering where the
/// touch was for events.
@MainActor
final class KuitoBetterSwipeGestureRecognizer: UISwipeGestureRecognizer {
    weak var gestureHandler: KuitoGestureHandler?
    /// Location of the most recently updated touch, relative to the view.
    private(set) var lastPoint = CGPoint.zero
    /// Whether the BEGAN event has been sent.
    private var hasBegan = false

    init() {
        super.init(target: nil, action: nil)
    }

    // Keeping the location of only one touch is enough since it would be used to determine the direction
    // of the movement, and if it's wrong the recognizer fails anyway.
    private func track(_ touches: Set<UITouch>) {
        if let touch = touches.first { lastPoint = touch.location(in: view) }
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        gestureHandler?.setCurrentPointerType(for: event)
        track(touches)
        gestureHandler?.reset()
        super.touchesBegan(touches, with: event)

        if state == .possible, gestureHandler?.gestureRecognizerShouldBegin(self) != true {
            state = .failed
            return
        }

        // numberOfTouches doesn't work for this because in case than one finger is required,
        // when holding one finger on the screen and tapping with the second one, numberOfTouches is equal
        // to 2 only for the first tap but 1 for all the following ones
        if !hasBegan {
            gestureHandler?.handleGesture(self, fromReset: false)
            hasBegan = true
        }
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        track(touches)
        super.touchesMoved(touches, with: event)
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        track(touches)
        super.touchesEnded(touches, with: event)
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        track(touches)
        super.touchesCancelled(touches, with: event)
    }

    override func reset() {
        gestureHandler?.handleGesture(self, fromReset: true)
        hasBegan = false
        super.reset()
        gestureHandler?.reset()
    }
}

@MainActor
final class KuitoFlingGestureHandler: KuitoGestureHandler {
    static let configKeys = commonConfigKeys.merging([
        "direction": .integer, "numberOfPointers": .integer,
    ]) { _, own in own }

    private let swipe: KuitoBetterSwipeGestureRecognizer

    init(tag: Int) {
        let swipe = KuitoBetterSwipeGestureRecognizer()

        self.swipe = swipe
        super.init(tag: tag, recognizer: swipe)
        swipe.gestureHandler = self
        swipe.addTarget(self, action: #selector(handleGesture(_:)))
    }

    override func resetConfig() {
        super.resetConfig()
        swipe.direction = .right
        swipe.numberOfTouchesRequired = 1
    }

    override func updateConfig(_ config: KuitoGestureConfig) {
        super.updateConfig(config)

        // RNGH's direction bits (RIGHT 1, LEFT 2, UP 4, DOWN 8) are UIKit's.
        if let direction = config.integer("direction") {
            swipe.direction = UISwipeGestureRecognizer.Direction(rawValue: UInt(clamping: direction))
        }

        if let pointers = config.integer("numberOfPointers") { swipe.numberOfTouchesRequired = pointers }
    }

    override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        let savedState = lastState
        let shouldBegin = super.gestureRecognizerShouldBegin(gestureRecognizer)

        lastState = savedState

        return shouldBegin
    }

    override func eventExtraData(_ recognizer: UIGestureRecognizer) -> KuitoGesturePayload {
        // A swipe's location in the window reads (0, 0): the absolute position is the view's
        // origin in the window plus the touch's position in the view.
        let location = swipe.lastPoint
        let viewOrigin = swipe.view.map { $0.convert($0.bounds.origin, to: nil) } ?? .zero

        return extraData(
            pointers: swipe.numberOfTouches,
            at: location,
            absolute: CGPoint(x: viewOrigin.x + location.x, y: viewOrigin.y + location.y)
        )
    }
}
