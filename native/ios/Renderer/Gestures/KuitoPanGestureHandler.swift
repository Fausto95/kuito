// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/apple/Handlers/RNPanHandler.m),
// MIT License, Copyright (c) 2016 Software Mansion.

import UIKit
import UIKit.UIGestureRecognizerSubclass

/// UIKit's pan, held back until RNGH's custom activation criteria pass and
/// failed when its fail offsets are crossed.
@MainActor
final class KuitoBetterPanGestureRecognizer: UIPanGestureRecognizer {
    weak var gestureHandler: KuitoGestureHandler?
    var minDistSq = CGFloat.nan
    var minVelocityX = CGFloat.nan
    var minVelocityY = CGFloat.nan
    var minVelocitySq = CGFloat.nan
    var activeOffsetXStart = CGFloat.nan
    var activeOffsetXEnd = CGFloat.nan
    var failOffsetXStart = CGFloat.nan
    var failOffsetXEnd = CGFloat.nan
    var activeOffsetYStart = CGFloat.nan
    var activeOffsetYEnd = CGFloat.nan
    var failOffsetYStart = CGFloat.nan
    var failOffsetYEnd = CGFloat.nan
    /// Seconds; NaN when unset.
    var activateAfterLongPress = CGFloat.nan
    private var realMinimumNumberOfTouches = 1
    private var hasCustomActivationCriteria = false

    init() {
        super.init(target: nil, action: nil)
        realMinimumNumberOfTouches = super.minimumNumberOfTouches
    }

    /// The configured minimum; UIKit's own is raised while custom criteria
    /// hold the pan back.
    override var minimumNumberOfTouches: Int {
        get { super.minimumNumberOfTouches }
        set { realMinimumNumberOfTouches = newValue }
    }

    private func triggerAction() {
        gestureHandler?.handleGesture(self, fromReset: false)
    }

    private func triggerActionFromReset() {
        gestureHandler?.handleGesture(self, fromReset: true)
    }

    @objc private func activateAfterLongPressTimeout() {
        state = .began
        // Send event in ACTIVE state because UIGestureRecognizerStateBegan is mapped to the BEGAN state.
        gestureHandler?.handleGesture(self, inState: .active)
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        gestureHandler?.setCurrentPointerType(for: event)

        if state == .possible, gestureHandler?.gestureRecognizerShouldBegin(self) != true {
            state = .failed
            return
        }

        // We use "minimumNumberOfTouches" property to prevent pan handler from recognizing
        // the gesture too early before we are sure that all criteria (e.g. minimum distance
        // etc. are met)
        super.minimumNumberOfTouches = hasCustomActivationCriteria ? 20 : realMinimumNumberOfTouches

        super.touchesBegan(touches, with: event)
        triggerAction()

        if !activateAfterLongPress.isNaN {
            perform(#selector(activateAfterLongPressTimeout), with: nil, afterDelay: activateAfterLongPress)
        }
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesMoved(touches, with: event)

        if state == .possible && shouldFailUnderCustomCriteria() {
            state = .failed
            triggerAction()
            return
        }

        if state == .possible || state == .changed,
           let handler = gestureHandler, handler.shouldCancelWhenOutside, !handler.containsPointInView() {
            // If the previous recognizer state is UIGestureRecognizerStateChanged
            // then UIGestureRecognizer's state machine will only transition to
            // UIGestureRecognizerStateCancelled even if you set the state to
            // UIGestureRecognizerStateFailed here. Making the behavior explicit.
            state = state == .possible ? .failed : .cancelled

            reset()
            return
        }

        if hasCustomActivationCriteria && state == .possible && shouldActivateUnderCustomCriteria() {
            super.minimumNumberOfTouches = realMinimumNumberOfTouches

            if numberOfTouches >= realMinimumNumberOfTouches {
                state = .began
                setTranslation(.zero, in: view)
            }
        }
    }

    override func reset() {
        triggerActionFromReset()
        NSObject.cancelPreviousPerformRequests(
            withTarget: self, selector: #selector(activateAfterLongPressTimeout), object: nil
        )
        super.reset()
        gestureHandler?.reset()
    }

    func updateHasCustomActivationCriteria() {
        hasCustomActivationCriteria = !minDistSq.isNaN || !minVelocityX.isNaN || !minVelocityY.isNaN
            || !minVelocitySq.isNaN || !activeOffsetXStart.isNaN || !activeOffsetXEnd.isNaN
            || !activeOffsetYStart.isNaN || !activeOffsetYEnd.isNaN
    }

    private func shouldFailUnderCustomCriteria() -> Bool {
        let trans = translation(in: view?.window)

        // Apple docs say that 10 units is the default allowable movement for UILongPressGestureRecognizer
        if !activateAfterLongPress.isNaN && KuitoGestureCriteria.lengthSquared(trans) > 100 {
            NSObject.cancelPreviousPerformRequests(
                withTarget: self, selector: #selector(activateAfterLongPressTimeout), object: nil
            )
            return true
        }

        if !failOffsetXStart.isNaN && trans.x < failOffsetXStart { return true }
        if !failOffsetXEnd.isNaN && trans.x > failOffsetXEnd { return true }
        if !failOffsetYStart.isNaN && trans.y < failOffsetYStart { return true }
        if !failOffsetYEnd.isNaN && trans.y > failOffsetYEnd { return true }

        return false
    }

    private func shouldActivateUnderCustomCriteria() -> Bool {
        let trans = translation(in: view?.window)

        if !activeOffsetXStart.isNaN && trans.x < activeOffsetXStart { return true }
        if !activeOffsetXEnd.isNaN && trans.x > activeOffsetXEnd { return true }
        if !activeOffsetYStart.isNaN && trans.y < activeOffsetYStart { return true }
        if !activeOffsetYEnd.isNaN && trans.y > activeOffsetYEnd { return true }

        if KuitoGestureCriteria.reachesMin(KuitoGestureCriteria.lengthSquared(trans), minDistSq) { return true }

        let velocity = velocity(in: view)

        if KuitoGestureCriteria.reachesAbsMin(velocity.x, minVelocityX) { return true }
        if KuitoGestureCriteria.reachesAbsMin(velocity.y, minVelocityY) { return true }
        if KuitoGestureCriteria.reachesMin(KuitoGestureCriteria.lengthSquared(velocity), minVelocitySq) { return true }

        return false
    }
}

@MainActor
final class KuitoPanGestureHandler: KuitoGestureHandler {
    static let configKeys = commonConfigKeys.merging([
        "activeOffsetXStart": .number, "activeOffsetXEnd": .number,
        "activeOffsetYStart": .number, "activeOffsetYEnd": .number,
        "failOffsetXStart": .number, "failOffsetXEnd": .number,
        "failOffsetYStart": .number, "failOffsetYEnd": .number,
        "minDist": .number, "minPointers": .integer, "maxPointers": .integer,
        "minVelocity": .number, "minVelocityX": .number, "minVelocityY": .number,
        // Android's averaging of pointer positions: UIKit's pan always tracks their centroid.
        "avgTouches": .bool,
        "activateAfterLongPress": .number,
    ]) { _, own in own }

    private let pan: KuitoBetterPanGestureRecognizer

    init(tag: Int) {
        let pan = KuitoBetterPanGestureRecognizer()

        self.pan = pan
        super.init(tag: tag, recognizer: pan)
        pan.gestureHandler = self
        pan.addTarget(self, action: #selector(handleGesture(_:)))
    }

    override func resetConfig() {
        super.resetConfig()
        pan.minVelocityX = .nan
        pan.minVelocityY = .nan
        pan.activeOffsetXStart = .nan
        pan.activeOffsetXEnd = .nan
        pan.failOffsetXStart = .nan
        pan.failOffsetXEnd = .nan
        pan.activeOffsetYStart = .nan
        pan.activeOffsetYEnd = .nan
        pan.failOffsetYStart = .nan
        pan.failOffsetYEnd = .nan
        pan.allowedScrollTypesMask = []
        pan.minimumNumberOfTouches = 1
        pan.maximumNumberOfTouches = Int.max
        pan.minDistSq = .nan
        pan.minVelocitySq = .nan
        pan.activateAfterLongPress = .nan
    }

    override func updateConfig(_ config: KuitoGestureConfig) {
        super.updateConfig(config)

        if let value = config.number("minVelocityX") { pan.minVelocityX = value }
        if let value = config.number("minVelocityY") { pan.minVelocityY = value }
        if let value = config.number("activeOffsetXStart") { pan.activeOffsetXStart = value }
        if let value = config.number("activeOffsetXEnd") { pan.activeOffsetXEnd = value }
        if let value = config.number("failOffsetXStart") { pan.failOffsetXStart = value }
        if let value = config.number("failOffsetXEnd") { pan.failOffsetXEnd = value }
        if let value = config.number("activeOffsetYStart") { pan.activeOffsetYStart = value }
        if let value = config.number("activeOffsetYEnd") { pan.activeOffsetYEnd = value }
        if let value = config.number("failOffsetYStart") { pan.failOffsetYStart = value }
        if let value = config.number("failOffsetYEnd") { pan.failOffsetYEnd = value }
        if let value = config.integer("minPointers") { pan.minimumNumberOfTouches = value }
        if let value = config.integer("maxPointers") { pan.maximumNumberOfTouches = value }

        if let dist = config.number("minDist") { pan.minDistSq = dist * dist }

        if let velocity = config.number("minVelocity") { pan.minVelocitySq = velocity * velocity }

        if let delay = config.number("activateAfterLongPress") {
            pan.activateAfterLongPress = delay / 1000
            pan.minDistSq = max(100, pan.minDistSq)
        }

        pan.updateHasCustomActivationCriteria()
    }

    override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        let savedState = lastState
        let shouldBegin = super.gestureRecognizerShouldBegin(gestureRecognizer)

        lastState = savedState

        return shouldBegin
    }

    override func eventExtraData(_ recognizer: UIGestureRecognizer) -> KuitoGesturePayload {
        let window = pan.view?.window
        let translation = pan.translation(in: window)
        let velocity = pan.velocity(in: window)
        var payload = extraData(pointers: pan.numberOfTouches, at: pan.location(in: pan.view), absolute: pan.location(in: window))

        payload.translationX = Double(translation.x)
        payload.translationY = Double(translation.y)
        payload.velocityX = Double(safeVelocity(velocity.x))
        payload.velocityY = Double(safeVelocity(velocity.y))

        return payload
    }
}
