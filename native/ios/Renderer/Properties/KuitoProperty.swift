import UIKit

/// What a property setter needs: the view and its style.
@MainActor
struct KuitoPropertyContext {
    let id: UInt32
    /// The prop's key on the wire (KuitoProps.byKey), or kuitoNamedProp.
    let key: UInt16
    let name: String
    let view: UIView
    let style: KuitoViewStyle
    let events: KuitoEventEmitter
    let keyboard: KuitoKeyboard
    let accessibility: KuitoAccessibilityMonitor
    /// The user's text size, which every font scales by.
    let textScale: KuitoTextScale

    /// This view takes no such prop: it is another kind's.
    func unsupportedProp() -> KuitoRenderError {
        .unsupportedProp(prop: name, view: style.described(id))
    }

    /// The prop takes no such value; `reason` says what it takes.
    func unsupportedValue(_ value: KuitoValue, _ reason: String) -> KuitoRenderError {
        .unsupportedValue(prop: name, value: value.quoted, view: style.described(id), reason: reason)
    }
}

/// A typed value as the kind of value a setter takes; a value of another
/// kind is unsupported. Null never reaches a setter of a prop the manifest
/// unsets to a value; one that restores its initial state checks for null
/// before it reads the value (docs/native-renderer.md#unset-props).
extension KuitoPropertyContext {
    func number(_ value: KuitoValue) throws -> CGFloat {
        guard case .number(let number) = value else { throw unsupportedValue(value, "expects a number") }

        return CGFloat(number)
    }

    func color(_ value: KuitoValue) throws -> UIColor {
        guard case .color(let rgba) = value else { throw unsupportedValue(value, "expects a color") }

        return UIColor(kuitoRGBA: rgba)
    }

    /// An enum's value as written.
    func keyword(_ value: KuitoValue) throws -> String {
        guard case .enumValue(_, let text) = value else { throw unsupportedValue(value, "expects one of its values") }

        return text
    }

    func flag(_ value: KuitoValue) throws -> Bool {
        guard case .bool(let flag) = value else { throw unsupportedValue(value, "expects a boolean") }

        return flag
    }

    func text(_ value: KuitoValue) throws -> String {
        guard case .text(let text) = value else { throw unsupportedValue(value, "expects a string") }

        return text
    }

    /// A structured prop's value, read by its generated type
    /// (KuitoPropValues): C++ checked the record against the prop's schema.
    func structure<Value>(_ value: KuitoValue, _ read: (KuitoStructRecord) -> Value) throws -> Value {
        guard case .structure(let record) = value else { throw unsupportedValue(value, "expects a structured value") }

        return read(record)
    }
}

/// A setter for one kind of view: on any other view the prop is unsupported.
@MainActor
func on<View>(
    _: View.Type,
    _ apply: @escaping @MainActor (KuitoPropertyContext, View, KuitoValue) throws -> Void
) -> KuitoPropertySetter {
    { context, value in
        guard let view = context.view as? View else { throw context.unsupportedProp() }

        try apply(context, view, value)
    }
}

/// Sets a prop from the value the host batch typed (docs/native-scheduling.md).
typealias KuitoPropertySetter = @MainActor (KuitoPropertyContext, KuitoValue) throws -> Void

/// A prop that can change a measured leaf's content size (its text, font,
/// rows): the leaf measures again in the next pass. Any other prop leaves the
/// layout as it is.
@MainActor
func remeasured<Value>(
    _ set: @escaping @MainActor (KuitoPropertyContext, Value) throws -> Void
) -> @MainActor (KuitoPropertyContext, Value) throws -> Void {
    { context, value in
        try set(context, value)
        context.style.remeasure()
    }
}

/// Every native prop's setter. Each table owns one concern.
@MainActor
enum KuitoProperties {
    /// Each prop's setter by its key on the wire (KuitoProps.byKey), taking
    /// null as the manifest's unset rule says; nil where iOS has none. A
    /// record's key finds it without hashing a name.
    static let byKey: [KuitoPropertySetter?] = zip(KuitoProps.byKey, KuitoProps.unsetByKey).map { name, unset in
        all[name].map { unsetting(unset, $0) }
    }

    /// Whether the prop at each key is a layout prop.
    static let layoutByKey: [Bool] = KuitoProps.byKey.map { KuitoLayoutProperties.setters[$0] != nil }

    /// Null as `unset` says: the value it stands for, the setter's own
    /// initial state, or an error.
    static func unsetting(_ unset: KuitoUnset, _ set: @escaping KuitoPropertySetter) -> KuitoPropertySetter {
        switch unset {
        case .value(let unsetValue):
            { context, value in try set(context, value == .null ? unsetValue : value) }
        case .initial:
            set
        case .required:
            { context, value in
                if value == .null { throw context.unsupportedValue(value, "is required: it can't be unset") }

                try set(context, value)
            }
        }
    }

    private static let all: [String: KuitoPropertySetter] = [
        KuitoAnimationProperties.setters,
        KuitoLayoutProperties.setters,
        KuitoDecorationProperties.setters,
        KuitoTextProperties.setters,
        KuitoControlProperties.setters,
        KuitoPressProperties.setters,
        KuitoImageProperties.setters,
        KuitoSymbolProperties.setters,
        KuitoScrollProperties.setters,
        KuitoListProperties.setters,
        KuitoSafeAreaProperties.setters,
        KuitoSheetProperties.setters,
        KuitoNavigationProperties.setters,
        KuitoAccessibilityProperties.setters,
        KuitoKeyboardProperties.setters,
        KuitoInputProperties.setters,
        KuitoGestureProperties.setters,
        KuitoMotionProperties.setters,
    ].reduce(into: [:]) { merged, table in
        merged.merge(table) { _, _ in preconditionFailure("A prop belongs to one table") }
    }
}
