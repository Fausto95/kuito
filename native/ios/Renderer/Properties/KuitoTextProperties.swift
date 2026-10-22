import UIKit

/// Text content and typography for labels, buttons and fields.
@MainActor
enum KuitoTextProperties {
    static let setters: [String: KuitoPropertySetter] = [
        "text": remeasured { context, value in
            let text = try context.text(value)

            switch context.view {
            case let label as UILabel:
                context.style.labelText = text
                scale(label, context.style, context.textScale.traits)
            case let button as UIButton:
                button.setTitle(text, for: .normal)
            case let field as KuitoTextInput:
                field.show(text)
            default:
                throw context.unsupportedProp()
            }
        },
        "color": { context, value in
            let color = value == .null ? nil : try context.color(value)

            switch context.view {
            case let label as UILabel:
                context.style.text.color = color
                scale(label, context.style, context.textScale.traits)
            case let button as UIButton:
                button.setTitleColor(color, for: .normal)
            case let field as KuitoTextInput:
                field.textColor = color
            default:
                throw context.unsupportedProp()
            }
        },
        "fontSize": remeasured { context, value in
            let size = try context.number(value)

            if let field = context.view as? KuitoTextInput {
                context.style.text.fontSize = size
                scale(field, context.style, context.textScale.traits)

                return
            }

            try restyle(context) { $0.fontSize = size }
        },
        "maxFontScale": remeasured(label { context, style, value in
            guard value != .null else { return style.maxFontScale = nil }

            let scale = try context.number(value)

            guard scale >= 1 else { throw context.unsupportedValue(value, "expects 1 or more: it caps how much the user's text size enlarges the text") }

            style.maxFontScale = scale
        }),
        "fontWeight": remeasured { context, value in
            guard let weight = KuitoTextStyle.weightsByName[try context.keyword(value)] else {
                throw context.unsupportedValue(value, "expects one of its values")
            }

            try restyle(context) { $0.weight = weight }
        },
        "fontFamily": remeasured { context, value in
            let family = value == .null ? nil : try context.text(value)

            if let family, !KuitoFonts.shared.has(family) { throw context.unsupportedValue(value, KuitoFonts.missing(family)) }

            try restyle(context) { $0.family = family }
        },
        "fontStyle": remeasured(label { context, style, value in style.italic = try context.keyword(value) == "italic" }),
        "lineHeight": remeasured(label { context, style, value in
            style.lineHeight = value == .null ? nil : try context.number(value)
        }),
        "letterSpacing": remeasured(label { context, style, value in style.letterSpacing = try context.number(value) }),
        "textAlign": label { context, style, value in
            style.alignment = value == .null ? .natural : ["center": .center, "right": .right][try context.keyword(value)] ?? .left
        },
        "textTransform": remeasured(label { context, style, value in
            style.textTransform = try context.keyword(value)
        }),
        "lineClamp": remeasured { context, value in
            guard let label = context.view as? UILabel else { throw context.unsupportedProp() }

            label.numberOfLines = Int(try context.number(value))
        },
    ]

    /// Font props shared by labels and buttons.
    private static func restyle(
        _ context: KuitoPropertyContext,
        _ change: (inout KuitoTextStyle) -> Void
    ) throws {
        guard context.view is UILabel || context.view is UIButton else { throw context.unsupportedProp() }

        change(&context.style.text)
        scale(context.view, context.style, context.textScale.traits)
    }

    /// Shows the view's text in its style's font at the user's text size;
    /// false for a view that shows no text.
    @discardableResult
    static func scale(_ view: UIView, _ style: KuitoViewStyle, _ traits: UITraitCollection) -> Bool {
        switch view {
        case let label as UILabel:
            label.attributedText = style.text.attributed(style.labelText, scaledFor: traits)
        case let button as UIButton:
            button.titleLabel?.font = style.text.font(scaledFor: traits)
        case let field as KuitoTextInput:
            field.font = style.text.font(scaledFor: traits)
        default:
            return false
        }

        return true
    }

    /// Props only labels support.
    private static func label(
        _ change: @escaping @MainActor (KuitoPropertyContext, inout KuitoTextStyle, KuitoValue) throws -> Void
    ) -> KuitoPropertySetter {
        { context, value in
            guard let label = context.view as? UILabel else { throw context.unsupportedProp() }

            try change(context, &context.style.text, value)
            scale(label, context.style, context.textScale.traits)
        }
    }

}
