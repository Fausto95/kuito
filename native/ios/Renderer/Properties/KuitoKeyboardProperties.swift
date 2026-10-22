import UIKit

/// The keyboard: return key and submit behavior, autofocus, dismissal and
/// tap handling in scroll views, and avoidance.
@MainActor
enum KuitoKeyboardProperties {
    private static let returnKeys: [String: UIReturnKeyType] = [
        "enter": .default, "done": .done, "go": .go, "next": .next, "search": .search, "send": .send,
    ]
    private static let dismissModes: [String: UIScrollView.KeyboardDismissMode] = [
        "none": .none, "on-drag": .onDrag, "interactive": .interactive,
    ]
    private static let submitBehaviors: Set<String> = ["submit", "blurAndSubmit", "newline"]
    private static let tapModes: Set<String> = ["never", "always", "handled"]

    static let setters: [String: KuitoPropertySetter] = [
        "enterKeyHint": field { context, field, value in
            guard let key = returnKeys[try context.keyword(value)] else { throw context.unsupportedValue(value, "expects one of its values") }

            field.returnKeyType = key
            field.reloadInputViews()
        },
        "submitBehavior": field { context, field, value in
            let behavior = value == .null ? nil : try context.keyword(value)

            guard behavior.map(submitBehaviors.contains) ?? true else { throw context.unsupportedValue(value, "expects one of its values") }

            field.submitBehavior = behavior
        },
        "autoFocus": field { context, field, value in field.autoFocus = try context.flag(value) },
        "keyboardDismissMode": scrollable { context, scroll, value in
            guard let mode = dismissModes[try context.keyword(value)] else { throw context.unsupportedValue(value, "expects one of its values") }

            scroll.keyboardDismissMode = mode
        },
        "keyboardShouldPersistTaps": scrollable { context, scroll, value in
            let mode = try context.keyword(value)

            guard tapModes.contains(mode) else { throw context.unsupportedValue(value, "expects one of its values") }

            KuitoKeyboardTaps.of(scroll, keyboard: context.keyboard).mode = mode
        },
        "automaticallyAdjustKeyboardInsets": { context, value in
            guard let scrollable = context.view as? KuitoScrollable else { throw context.unsupportedProp() }

            scrollable.automaticallyAdjustsKeyboardInsets = try context.flag(value)
            context.keyboard.avoid()
        },
        "keyboardAvoidance": { context, value in
            let name = try context.keyword(value)
            let mode = KuitoKeyboardAvoider.Mode(rawValue: name)

            guard mode != nil || name == "none" else { throw context.unsupportedValue(value, "expects one of its values") }

            context.style.keyboardAvoider?.reset()
            context.style.keyboardAvoider = mode.map { KuitoKeyboardAvoider(mode: $0, view: context.view, style: context.style) }
            context.style.keyboardAvoider.map(context.keyboard.avoiders.add)
            context.keyboard.avoid()
        },
    ]

    private static func field(
        _ apply: @escaping @MainActor (KuitoPropertyContext, KuitoTextInput, KuitoValue) throws -> Void
    ) -> KuitoPropertySetter {
        { context, value in
            guard let field = context.view as? KuitoTextInput else { throw context.unsupportedProp() }

            try apply(context, field, value)
        }
    }

    /// A ScrollView or a List.
    private static func scrollable(
        _ apply: @escaping @MainActor (KuitoPropertyContext, UIScrollView, KuitoValue) throws -> Void
    ) -> KuitoPropertySetter {
        { context, value in
            guard let scrollable = context.view as? KuitoScrollable else { throw context.unsupportedProp() }

            try apply(context, scrollable.scroller, value)
        }
    }
}
