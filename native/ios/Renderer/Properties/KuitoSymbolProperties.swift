import UIKit

/// A Symbol's name, size and weight; tintColor is Image's (docs/assets.md#symbols).
@MainActor
enum KuitoSymbolProperties {
    static let setters: [String: KuitoPropertySetter] = [
        // A name, or { ios, android } names.
        "name": symbol { context, view, value in
            switch try context.structure(value, KuitoPropValues.name) {
            case .name(let name): try view.setName(name)
            case .platforms(let names): try view.setName(names.ios)
            }
        },
        "size": symbol { context, view, value in view.setSize(try context.number(value)) },
        "weight": symbol { context, view, value in
            guard let weight = KuitoSymbolView.weights[try context.keyword(value)] else {
                throw context.unsupportedValue(value, "expects one of its values")
            }

            view.setWeight(weight)
        },
    ]

    private static func symbol(
        _ apply: @escaping @MainActor (KuitoPropertyContext, KuitoSymbolView, KuitoValue) throws -> Void
    ) -> KuitoPropertySetter {
        { context, value in
            guard let view = context.view as? KuitoSymbolView else { throw context.unsupportedProp() }

            try apply(context, view, value)
        }
    }
}
