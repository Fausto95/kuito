import UIKit

/// A view's accessibility props, composed into what VoiceOver reads: whether
/// it is an element, its traits, value and actions. Several props feed each
/// of these, so every change recomposes them all from this state.
@MainActor
final class KuitoAccessibility {
    var accessible: Bool?
    var label: String?
    var hint: String?
    var role: String?
    var elementsHidden = false
    /// `aria-*` state and value facts, by prop name.
    var facts: [String: Any] = [:]
    var actions: [(name: String, label: String?)] = []
    var live: KuitoLiveRegion?
    /// Whether this view has standard action blocks to clear.
    private var hasStandardActions = false

    /// What the view was before a prop changed it, restored when the prop goes.
    /// Captured lazily: UIKit computes a label's or button's defaults only once
    /// its accessibility bundle loads, so a property no prop controls is never written.
    private var defaultIsElement: Bool?
    private var defaultTraits: UIAccessibilityTraits?

    /// Traits UIKit's accessibility bundle gives these views, which a view
    /// reports only while an assistive technology runs.
    private static let classTraits: [(AnyClass, UIAccessibilityTraits)] = [
        (UIButton.self, .button), (UISwitch.self, .button), (UILabel.self, .staticText), (UIImageView.self, .image),
    ]

    /// React Native's roles as VoiceOver traits. Roles without a trait still
    /// matter on Android and through the `tablist` container trait.
    static let roles: [String: UIAccessibilityTraits] = [
        "none": [], "adjustable": .adjustable, "alert": [], "button": .button, "checkbox": .button,
        "combobox": .button, "grid": [], "header": .header, "image": .image, "imagebutton": [.image, .button],
        "keyboardkey": .keyboardKey, "link": .link, "list": [], "menu": [], "menubar": [], "menuitem": .button,
        "progressbar": .updatesFrequently, "radio": .button, "radiogroup": [], "scrollbar": [],
        "search": .searchField, "spinbutton": .adjustable, "summary": .summaryElement, "switch": .button,
        "tab": .button, "tablist": .tabBar, "text": .staticText, "timer": .updatesFrequently,
        "togglebutton": .button, "toolbar": [],
    ]

    /// Words VoiceOver reads for `aria-checked`: a switch is on or off, a checkbox checked.
    private static let checkedWords: [String: [String: String]] = [
        "switch": ["true": "on", "false": "off", "mixed": "mixed"],
        "togglebutton": ["true": "on", "false": "off", "mixed": "mixed"],
    ]
    private static let defaultCheckedWords = ["true": "checked", "false": "not checked", "mixed": "mixed"]

    func apply(to view: UIView, emit: @escaping (String, KuitoAccessibilityActionPayload) -> Void) {
        let isElement = accessible

        if let isElement {
            defaultIsElement = defaultIsElement ?? view.isAccessibilityElement
            view.isAccessibilityElement = isElement
        } else if let defaultIsElement {
            view.isAccessibilityElement = defaultIsElement
        }

        let traits = traits()

        if !traits.isEmpty || defaultTraits != nil {
            let base = defaultTraits ?? Self.classTraits.filter { view.isKind(of: $0.0) }.reduce(view.accessibilityTraits) { $0.union($1.1) }

            defaultTraits = base
            view.accessibilityTraits = base.union(traits)
        }

        view.accessibilityElementsHidden = elementsHidden
        view.accessibilityLabel = label
        view.accessibilityHint = hint
        view.accessibilityValue = value()
        composeLabel(of: view)
        applyActions(to: view, emit: emit)
    }

    private func traits() -> UIAccessibilityTraits {
        var traits = role.flatMap { Self.roles[$0] } ?? []

        if fact("aria-disabled") == "true" { traits.insert(.notEnabled) }

        if fact("aria-selected") == "true" { traits.insert(.selected) }

        return traits
    }

    /// The text value, or the range's current value, then the state words VoiceOver has no trait for.
    private func value() -> String? {
        let checkedWords = role.flatMap { Self.checkedWords[$0] } ?? Self.defaultCheckedWords
        let words = [
            fact("aria-valuetext") ?? fact("aria-valuenow"),
            fact("aria-checked").flatMap { checkedWords[$0] },
            fact("aria-expanded").map { $0 == "true" ? "expanded" : "collapsed" },
            fact("aria-busy") == "true" ? "busy" : nil,
        ].compactMap { $0 }

        return words.isEmpty ? nil : words.joined(separator: ", ")
    }

    private func fact(_ name: String) -> String? {
        facts[name].map { value in
            if let flag = value as? Bool { return flag ? "true" : "false" }
            if let number = value as? NSNumber { return number.stringValue }
            return String(describing: value)
        }
    }

    /// An accessible container without a label reads its children, as in React Native.
    private func composeLabel(of view: UIView) {
        guard #available(iOS 17.0, *) else { return }

        let composes = label == nil && accessible == true && !(view is UILabel) && !(view is UIControl)

        view.accessibilityLabelBlock = composes ? { [weak view] in view.map(Self.childText) ?? nil } : nil
    }

    static func childText(of view: UIView) -> String? {
        let parts = view.subviews.filter { !$0.isHidden && !$0.accessibilityElementsHidden }.compactMap { child -> String? in
            if child.isAccessibilityElement, let label = child.accessibilityLabel, !label.isEmpty { return label }
            return childText(of: child)
        }

        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }

    /// Standard actions become VoiceOver's own gestures (activate, swipe up and
    /// down, magic tap, escape) on iOS 17; the rest, and all on iOS 16, are
    /// custom actions in the actions rotor.
    private func applyActions(to view: UIView, emit: @escaping (String, KuitoAccessibilityActionPayload) -> Void) {
        var custom: [UIAccessibilityCustomAction] = []

        if #available(iOS 17.0, *), hasStandardActions {
            Self.clearStandardActions(of: view)
            hasStandardActions = false
        }

        for action in actions {
            let fire = { emit("accessibilityaction", KuitoAccessibilityActionPayload(actionName: action.name)) }

            if #available(iOS 17.0, *), Self.setStandardAction(action.name, on: view, fire) {
                hasStandardActions = true

                continue
            }

            custom.append(UIAccessibilityCustomAction(name: action.label ?? action.name) { _ in
                fire()

                return true
            })
        }

        view.accessibilityCustomActions = custom.isEmpty ? nil : custom
    }

    @available(iOS 17.0, *)
    private static func setStandardAction(_ name: String, on view: UIView, _ fire: @escaping () -> Void) -> Bool {
        switch name {
        case "activate": view.accessibilityActivateBlock = { fire(); return true }
        case "increment": view.accessibilityIncrementBlock = fire
        case "decrement": view.accessibilityDecrementBlock = fire
        case "magicTap": view.accessibilityMagicTapBlock = { fire(); return true }
        case "escape": view.accessibilityPerformEscapeBlock = { fire(); return true }
        default: return false
        }

        return true
    }

    @available(iOS 17.0, *)
    private static func clearStandardActions(of view: UIView) {
        view.accessibilityActivateBlock = nil
        view.accessibilityIncrementBlock = nil
        view.accessibilityDecrementBlock = nil
        view.accessibilityMagicTapBlock = nil
        view.accessibilityPerformEscapeBlock = nil
    }
}
