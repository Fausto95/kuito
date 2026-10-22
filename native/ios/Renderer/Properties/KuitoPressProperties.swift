import UIKit

/// Pressable behavior: feedback, long-press delay and hit area.
@MainActor
enum KuitoPressProperties {
    static let setters: [String: KuitoPropertySetter] = [
        "pressedOpacity": pressable { context, view, value in
            view.activeOpacity = min(max(try context.number(value), 0), 1)
        },
        "pressedScale": pressable { context, view, value in view.pressedScale = max(try context.number(value), 0) },
        "longPressDuration": pressable { context, view, value in
            view.longPressDuration = max(try context.number(value), 0) / 1000
        },
        "hitArea": pressable { context, view, value in view.hitSlop = max(try context.number(value), 0) },
        "haptic": pressable { context, view, value in view.haptic = value == .null ? nil : try context.keyword(value) },
    ]

    private static func pressable(
        _ apply: @escaping @MainActor (KuitoPropertyContext, KuitoPressableView, KuitoValue) throws -> Void
    ) -> KuitoPropertySetter {
        { context, value in
            guard let view = context.view as? KuitoPressableView else { throw context.unsupportedProp() }

            try apply(context, view, value)
        }
    }
}
