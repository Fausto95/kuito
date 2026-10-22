import UIKit

/// A view's attached gestures by tag. A new set replaces the old one: gestures
/// whose tag is gone are removed, kept ones are reconfigured, new ones bound.
@MainActor
struct KuitoGestureSet {
    private var handlers: [Int: (type: String, handler: KuitoGestureHandler)] = [:]

    mutating func update(_ specs: [KuitoGestureSpec], on view: UIView, emit: @escaping (KuitoGesturePayload) -> Void) {
        let tags = Set(specs.map(\.tag))

        for (tag, entry) in handlers where !tags.contains(tag) {
            entry.handler.unbindFromView()
            handlers[tag] = nil
        }

        for spec in specs {
            if let kept = handlers[spec.tag], kept.type == spec.type.name, kept.handler.recognizer.view === view {
                kept.handler.setConfig(spec.config)
                kept.handler.updateRelations(spec.relations)

                continue
            }

            let handler = spec.type.make(spec.tag)

            handlers[spec.tag]?.handler.unbindFromView()
            handler.setConfig(spec.config)
            handler.updateRelations(spec.relations)
            handler.bind(to: view, emit: emit)
            handlers[spec.tag] = (spec.type.name, handler)
        }
    }

    mutating func removeAll() {
        handlers.values.forEach { $0.handler.unbindFromView() }
        handlers.removeAll()
    }
}
