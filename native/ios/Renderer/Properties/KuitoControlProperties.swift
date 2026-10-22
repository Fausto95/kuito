import UIKit

/// Control state: disabling, placeholders, toggles and indicators.
@MainActor
enum KuitoControlProperties {
    static let setters: [String: KuitoPropertySetter] = [
        "disabled": { context, value in
            let disabled = try context.flag(value)

            if let pressable = context.view as? KuitoPressableView {
                pressable.isDisabled = disabled
            } else if let field = context.view as? KuitoTextInput {
                field.disabled = disabled
            } else if let control = context.view as? UIControl {
                control.isEnabled = !disabled
            } else {
                throw context.unsupportedProp()
            }
        },
        "placeholder": remeasured { context, value in
            guard let field = context.view as? KuitoTextInput else { throw context.unsupportedProp() }

            field.placeholder = value == .null ? nil : try context.text(value)
        },
        "placeholderTextColor": { context, value in
            guard let field = context.view as? KuitoTextInput else { throw context.unsupportedProp() }

            field.placeholderColor = value == .null ? nil : try context.color(value)
        },
        "selectionColor": { context, value in
            guard let field = context.view as? KuitoTextInput else { throw context.unsupportedProp() }

            field.tintColor = value == .null ? nil : try context.color(value)
        },
        "checked": { context, value in
            guard let toggle = context.view as? UISwitch else { throw context.unsupportedProp() }

            let isOn = try context.flag(value)

            if toggle.isOn != isOn { toggle.setOn(isOn, animated: true) }
        },
        "animating": { context, value in
            guard let indicator = context.view as? UIActivityIndicatorView else { throw context.unsupportedProp() }

            if try context.flag(value) { indicator.startAnimating() } else { indicator.stopAnimating() }
        },
    ]
}
