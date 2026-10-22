// Ported from React Native Gesture Handler
// (https://github.com/software-mansion/react-native-gesture-handler,
// packages/react-native-gesture-handler/apple/RNGestureHandler.mm),
// MIT License, Copyright (c) 2016 Software Mansion.

import UIKit

/// Which other gestures, by tag, this one waits for, runs with, or blocks.
struct KuitoGestureRelations {
    var waitFor: [Int] = []
    var simultaneousHandlers: [Int] = []
    var blocksHandlers: [Int] = []
}

/// One gesture attached to a view: owns its UIKit recognizer, maps the
/// recognizer's states to RNGH's, and emits `gesture` events. Subclasses own
/// the recognizer and the gesture's event fields.
@MainActor
class KuitoGestureHandler: NSObject, UIGestureRecognizerDelegate {
    static let commonConfigKeys: [String: KuitoGestureConfig.Kind] = [
        "enabled": .bool,
        "shouldCancelWhenOutside": .bool,
        "hitSlop": .hitSlop,
    ]

    let tag: Int
    let recognizer: UIGestureRecognizer
    /// The last state sent in an event.
    var lastState = KuitoGestureState.undetermined
    var pointerType = KuitoGesturePointerType.touch
    private(set) var enabled = true {
        didSet { recognizer.isEnabled = enabled }
    }
    private(set) var shouldCancelWhenOutside = false
    private var currentState = KuitoGestureState.began
    private var hitSlop = KuitoGestureHitSlop.empty
    /// Sends a `gesture` event from the view the handler is bound to.
    private var emit: ((KuitoGesturePayload) -> Void)?

    init(tag: Int, recognizer: UIGestureRecognizer) {
        self.tag = tag
        self.recognizer = recognizer
        super.init()
    }

    // MARK: - Config

    /// A new config replaces the previous one: unset keys take their defaults.
    func setConfig(_ config: KuitoGestureConfig) {
        resetConfig()
        updateConfig(config)
    }

    func resetConfig() {
        enabled = true
        shouldCancelWhenOutside = false
        hitSlop = .empty
        recognizer.cancelsTouchesInView = true
    }

    func updateConfig(_ config: KuitoGestureConfig) {
        if let enabled = config.bool("enabled") { self.enabled = enabled }

        if let cancel = config.bool("shouldCancelWhenOutside") { shouldCancelWhenOutside = cancel }

        if let hitSlop = config.hitSlop { self.hitSlop = hitSlop }
    }

    func updateRelations(_ relations: KuitoGestureRelations) {
        KuitoGestureRegistry.relations.set(
            tag,
            waitFor: relations.waitFor.map(NSNumber.init),
            simultaneous: relations.simultaneousHandlers.map(NSNumber.init),
            blocks: relations.blocksHandlers.map(NSNumber.init)
        )
    }

    // MARK: - Binding

    func bind(to view: UIView, emit: @escaping (KuitoGesturePayload) -> Void) {
        recognizer.delegate = self
        self.emit = emit
        // Views like labels ignore touches by default.
        view.isUserInteractionEnabled = true
        view.addGestureRecognizer(recognizer)
        KuitoGestureRegistry.register(self)
    }

    func unbindFromView() {
        // If the gesture is still in flight - e.g. the view is being unmounted mid-gesture - deliver
        // the final event now, while the recognizer is still attached and the target view is known.
        // Otherwise the onBegin/onFinalize and onActivate/onDeactivate guarantees would be broken
        // and `lastState` would never be cleared by `reset`.
        if recognizer.view != nil, lastState == .began || lastState == .active {
            handleGesture(recognizer, inState: lastState == .active ? .cancelled : .failed)
        }

        recognizer.view?.removeGestureRecognizer(recognizer)
        recognizer.delegate = nil
        emit = nil
        KuitoGestureRegistry.drop(self)
    }

    // MARK: - Events

    /// The gesture's event fields; every event also reports its pointers.
    func eventExtraData(_ recognizer: UIGestureRecognizer) -> KuitoGesturePayload {
        extraData(
            pointers: recognizer.numberOfTouches,
            at: recognizer.location(in: recognizer.view),
            absolute: recognizer.location(in: recognizer.view?.window)
        )
    }

    /// The fields every event reports; `send` fills in the state.
    func extraData(pointers: Int) -> KuitoGesturePayload {
        KuitoGesturePayload(
            handlerTag: Double(tag),
            state: Double(KuitoGestureState.undetermined.rawValue),
            numberOfPointers: Double(pointers),
            pointerType: Double(pointerType.rawValue)
        )
    }

    func extraData(pointers: Int, at position: CGPoint, absolute: CGPoint) -> KuitoGesturePayload {
        var payload = extraData(pointers: pointers)

        payload.x = Double(position.x)
        payload.y = Double(position.y)
        payload.absoluteX = Double(absolute.x)
        payload.absoluteY = Double(absolute.y)

        return payload
    }

    /// A velocity is NaN before the recognizer has measured one.
    func safeVelocity(_ velocity: CGFloat) -> CGFloat { velocity.isNaN ? 0 : velocity }

    @objc func handleGesture(_ recognizer: UIGestureRecognizer) {
        handleGesture(recognizer, fromReset: false)
    }

    func handleGesture(_ recognizer: UIGestureRecognizer, fromReset: Bool) {
        // Don't dispatch state changes from undetermined when resetting handler. There will be no follow-up
        // since the handler is being reset, so these events are wrong.
        if fromReset && lastState == .undetermined { return }

        // It may happen that the gesture recognizer is reset after it's been unbound from the view;
        // its events have no view to come from.
        guard recognizer.view != nil, emit != nil else { return }

        currentState = recognizerState

        // When a handler activates itself (pan's activateAfterLongPress) it dispatches ACTIVE itself and
        // sets the recognizer's state to Began so that UIKit keeps driving it. UIKit delivers the action
        // for that programmatic transition asynchronously, so this method runs later with the recognizer
        // in Began while ACTIVE has already been sent. Keep the handler active instead.
        if !fromReset && currentState == .began && lastState == .active {
            currentState = .active
            return
        }

        // From iOS 26.0 when recognizers are reset, their state is also changed to UIGestureRecognizerStatePossible.
        // This means that logic that relies on sending events in `reset` methods doesn't work properly: both
        // recognizer states, `Began` and `Possible`, are mapped to our `began` state, so `lastState` had the same
        // value as the current state and the final callbacks were not triggered.
        //
        // The same applies to gestures interrupted mid-flight, e.g. when the view is unmounted during an active
        // gesture the recognizer may be reset without its cancel action ever firing.
        // If the last sent state is not final, synthesize the missing final event so that the
        // `onBegin`/`onFinalize` and `onActivate`/`onDeactivate` guarantees hold.
        if fromReset && self.recognizer.state == .possible {
            if lastState == .began {
                currentState = .failed
            } else if lastState == .active {
                currentState = .cancelled
            } else {
                // The final event was already delivered; mapping Possible to Began here would emit a stray
                // BEGAN event after the gesture has finished.
                return
            }
        }

        handleGesture(recognizer, inState: currentState)
    }

    func handleGesture(_ recognizer: UIGestureRecognizer, inState state: KuitoGestureState) {
        currentState = state

        sendEvents(in: self.state, extraData: eventExtraData(recognizer))
    }

    /// The changes the app hears come from the shared rules (native/shared/gestures/GestureEvents.h);
    /// an ACTIVE state also sends an update.
    private func sendEvents(in state: KuitoGestureState, extraData: KuitoGesturePayload) {
        let changes = KuitoGestureEvents.changes(from: lastState.rawValue, to: state.rawValue).map(\.intValue)

        for index in stride(from: 0, to: changes.count, by: 2) {
            guard let next = KuitoGestureState(rawValue: changes[index]),
                  let old = KuitoGestureState(rawValue: changes[index + 1]) else { continue }

            send(next, oldState: old, extraData)
            lastState = next
        }

        if state == .active { send(state, oldState: nil, extraData) }
    }

    /// A state change carries `oldState`; an update while ACTIVE does not.
    private func send(_ state: KuitoGestureState, oldState: KuitoGestureState?, _ extraData: KuitoGesturePayload) {
        var payload = extraData

        payload.state = Double(state.rawValue)
        payload.oldState = oldState.map { Double($0.rawValue) }

        emit?(payload)
    }

    private var recognizerState: KuitoGestureState {
        switch recognizer.state {
        case .began, .possible: .began
        case .ended: .end
        case .failed: .failed
        case .cancelled: .cancelled
        case .changed: .active
        @unknown default: .undetermined
        }
    }

    /// Instead of mapping the state of the recognizer directly, use the value mapped when handleGesture was
    /// called, making it correct while awaiting another handler's failure.
    var state: KuitoGestureState { currentState }

    func setCurrentPointerType(for event: UIEvent) {
        pointerType = KuitoGesturePointerType(event)
    }

    func reset() {
        // Do not clear `lastState` while the gesture is in flight (BEGAN/ACTIVE) - the final
        // state-change event hasn't been dispatched yet. Clearing it here would corrupt the oldState of
        // the outgoing CANCELLED event and break the onActivate/onDeactivate guarantee.
        if lastState != .began && lastState != .active {
            lastState = .undetermined
            currentState = .began
        }
    }

    func containsPointInView() -> Bool {
        guard let view = recognizer.view else { return false }

        return hitSlop.inset(view.bounds).contains(recognizer.location(in: view))
    }

    // MARK: - UIGestureRecognizerDelegate

    private static func handler(for recognizer: UIGestureRecognizer) -> KuitoGestureHandler? {
        recognizer.delegate as? KuitoGestureHandler
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldBeRequiredToFailBy otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        guard let handler = Self.handler(for: otherGestureRecognizer) else { return false }

        return KuitoGestureRegistry.relations.waits(handler.tag, for: tag)
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRequireFailureOf otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        guard let handler = Self.handler(for: otherGestureRecognizer) else { return false }

        return KuitoGestureRegistry.relations.waits(tag, for: handler.tag)
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        guard let handler = Self.handler(for: otherGestureRecognizer) else { return false }

        return KuitoGestureRegistry.relations.simultaneous(tag, handler.tag)
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        for tag in KuitoGestureRegistry.relations.awaited(by: tag) {
            guard let handler = KuitoGestureRegistry.handler(withTag: tag.intValue) else { continue }

            if handler.state == .active || handler.recognizer.state == .began { return false }
        }

        reset()
        return true
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        // If hitSlop is set we use it to determine if a given gesture recognizer should start processing
        // touch stream. This only works for negative values of hitSlop as this method won't be triggered
        // unless touch starts in the bounds of the attached view. To achieve similar effect with positive
        // values of hitSlop one should set hitSlop for the underlying view. This limitation is due to the
        // fact that hitTest method is only available at the level of UIView.
        guard hitSlop.isSet, let view = gestureRecognizer.view else { return true }

        return hitSlop.inset(view.bounds).contains(touch.location(in: view))
    }
}
