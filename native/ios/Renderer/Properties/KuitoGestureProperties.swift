import UIKit

/// The view's native gestures (docs/motion.md, "Native contract"): each
/// emits `gesture` events from the view.
@MainActor
enum KuitoGestureProperties {
    static let setters: [String: KuitoPropertySetter] = [
        "gestures": { context, value in
            let specs = try KuitoGestureSpec.parse(value == .null ? nil : context.structure(value, KuitoPropValues.gestures))
            let id = context.id
            let events = context.events

            context.style.gestures.update(specs, on: context.view) { payload in events.emit(id, "gesture", payload) }
        },
    ]
}
