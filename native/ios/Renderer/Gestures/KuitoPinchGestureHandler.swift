// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/apple/Handlers/RNPinchHandler.m),
// MIT License, Copyright (c) 2016 Software Mansion.

import UIKit
import UIKit.UIGestureRecognizerSubclass

/// UIKit's pinch, gated by the handler's relations.
@MainActor
final class KuitoBetterPinchRecognizer: UIPinchGestureRecognizer {
    weak var gestureHandler: KuitoGestureHandler?

    init() {
        super.init(target: nil, action: nil)
        addTarget(self, action: #selector(handleGestureAction))
    }

    @objc private func handleGestureAction() {
        // The scale reported on activation counts from the activating touches, not from touch-down.
        if state == .began { scale = 1 }

        gestureHandler?.handleGesture(self, fromReset: false)
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        gestureHandler?.setCurrentPointerType(for: event)
        super.touchesBegan(touches, with: event)

        if state == .possible, gestureHandler?.gestureRecognizerShouldBegin(self) != true {
            state = .failed
        }
    }

    override func reset() {
        super.reset()
        gestureHandler?.reset()
    }
}

@MainActor
final class KuitoPinchGestureHandler: KuitoGestureHandler {
    static let configKeys = commonConfigKeys

    private let pinch: KuitoBetterPinchRecognizer

    init(tag: Int) {
        let pinch = KuitoBetterPinchRecognizer()

        self.pinch = pinch
        super.init(tag: tag, recognizer: pinch)
        pinch.gestureHandler = self
    }

    override func eventExtraData(_ recognizer: UIGestureRecognizer) -> KuitoGesturePayload {
        let numberOfTouches = pinch.numberOfTouches
        let focalPoint: CGPoint

        if numberOfTouches > 0 {
            let sum = (0..<numberOfTouches).reduce(CGPoint.zero) { sum, index in
                let location = pinch.location(ofTouch: index, in: pinch.view)

                return CGPoint(x: sum.x + location.x, y: sum.y + location.y)
            }

            focalPoint = CGPoint(x: sum.x / CGFloat(numberOfTouches), y: sum.y / CGFloat(numberOfTouches))
        } else {
            // Trackpad pinch gestures may report 0 touches - use the recognizer's location instead
            focalPoint = pinch.location(in: pinch.view)
        }

        var payload = extraData(pointers: numberOfTouches)

        payload.scale = Double(pinch.scale)
        payload.focalX = Double(focalPoint.x)
        payload.focalY = Double(focalPoint.y)
        payload.velocity = Double(safeVelocity(pinch.velocity))

        return payload
    }
}
