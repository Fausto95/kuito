// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/apple/Handlers/RNRotationHandler.m),
// MIT License, Copyright (c) 2016 Software Mansion.

import UIKit
import UIKit.UIGestureRecognizerSubclass

/// UIKit's rotation, gated by the handler's relations.
@MainActor
final class KuitoBetterRotationRecognizer: UIRotationGestureRecognizer {
    weak var gestureHandler: KuitoGestureHandler?

    init() {
        super.init(target: nil, action: nil)
        addTarget(self, action: #selector(handleGestureAction))
    }

    @objc private func handleGestureAction() {
        // The rotation reported on activation counts from the activating touches, not from touch-down.
        if state == .began { rotation = 0 }

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
final class KuitoRotationGestureHandler: KuitoGestureHandler {
    static let configKeys = commonConfigKeys

    private let rotation: KuitoBetterRotationRecognizer

    init(tag: Int) {
        let rotation = KuitoBetterRotationRecognizer()

        self.rotation = rotation
        super.init(tag: tag, recognizer: rotation)
        rotation.gestureHandler = self
    }

    override func eventExtraData(_ recognizer: UIGestureRecognizer) -> KuitoGesturePayload {
        let anchor = rotation.location(in: rotation.view)
        var payload = extraData(pointers: rotation.numberOfTouches)

        payload.rotation = Double(rotation.rotation)
        payload.anchorX = Double(anchor.x)
        payload.anchorY = Double(anchor.y)
        payload.velocity = Double(safeVelocity(rotation.velocity))

        return payload
    }
}
