import UIKit

/// What VoiceOver reads and does: labels, roles, state, value, actions,
/// visibility to screen readers and live regions. Each prop updates the
/// view's KuitoAccessibility, which recomposes the view.
@MainActor
enum KuitoAccessibilityProperties {
    private static let liveRegions: [String: Bool?] = ["off": nil, "polite": false, "assertive": true]

    static let setters: [String: KuitoPropertySetter] = [
        "accessible": accessibility { context, state, value in state.accessible = value == .null ? nil : try context.flag(value) },
        "label": accessibility { context, state, value in
            state.label = value == .null ? nil : try context.text(value)
        },
        "hint": accessibility { context, state, value in
            state.hint = value == .null ? nil : try context.text(value)
        },
        // The kernel sends ARIA's role as the role it means here (src/runtime/accessibility-props.ts).
        "role": accessibility { context, state, value in
            let role = value == .null ? nil : try context.keyword(value)

            guard role.map({ KuitoAccessibility.roles[$0] != nil }) ?? true else {
                throw context.unsupportedValue(value, "expects one of its values")
            }

            state.role = role
        },
        "aria-hidden": accessibility { context, state, value in state.elementsHidden = try context.flag(value) },
        "actions": accessibility { context, state, value in
            state.actions = try context.structure(value, KuitoPropValues.actions).map { ($0.name, $0.label) }
        },
        "live": accessibility { context, state, value in
            guard let assertive = liveRegions[try context.keyword(value)] else {
                throw context.unsupportedValue(value, "expects one of its values")
            }

            if let assertive {
                let region = state.live ?? KuitoLiveRegion(view: context.view, assertive: assertive)

                region.assertive = assertive
                state.live = region
                context.accessibility.liveRegions.add(region)
            } else {
                state.live.map(context.accessibility.liveRegions.remove)
                state.live = nil
            }
        },
        // ARIA's state and value facts.
        "aria-disabled": fact,
        "aria-selected": fact,
        "aria-checked": fact,
        "aria-busy": fact,
        "aria-expanded": fact,
        "aria-valuemin": fact,
        "aria-valuemax": fact,
        "aria-valuenow": fact,
        "aria-valuetext": fact,
    ]

    /// A flag, a number or text, kept as the scalar KuitoAccessibility reads.
    private static let fact: KuitoPropertySetter = accessibility { context, state, value in
        state.facts[context.name] = value.untyped
    }

    private static func accessibility(
        _ change: @escaping @MainActor (KuitoPropertyContext, KuitoAccessibility, KuitoValue) throws -> Void
    ) -> KuitoPropertySetter {
        { context, value in
            let state = context.style.accessibility
            let id = context.id
            let events = context.events

            try change(context, state, value)
            state.apply(to: context.view) { event, payload in events.emit(id, event, payload) }
        }
    }
}
