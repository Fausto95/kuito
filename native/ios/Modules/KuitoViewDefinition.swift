import UIKit

/// A UIView a native module contributes (docs/native-modules.md#views). Kuito makes
/// one per rendered element, on the main thread, and positions it with the
/// shared flexbox engine like any view.
protocol KuitoNativeView: UIView {
    init(events: KuitoViewEvents)

    /// Kuito removed the view, or the runtime is reloading: give back what
    /// it holds outside itself (a player, a capture session). The view may
    /// stay on screen a moment longer, for an exit animation.
    func unmount()
}

extension KuitoNativeView {
    func unmount() {}
}

/// A native view's way back to JavaScript: the events its spec
/// declares, in the wire format of docs/events.md.
@MainActor
final class KuitoViewEvents {
    private let id: UInt32
    private let emitter: KuitoEventEmitter
    private let declared: Set<String>

    init(id: UInt32, emitter: KuitoEventEmitter, declared: Set<String>) {
        self.id = id
        self.emitter = emitter
        self.declared = declared
    }

    func emit(_ event: String) {
        precondition(declared.contains(event), "Event \(event) is not declared by the view's spec")
        emitter.emitJSON(id, event, nil)
    }

    /// The payload's fields arrive on the event JavaScript receives, so it
    /// encodes to a JSON object.
    func emit<Payload: Encodable>(_ event: String, _ payload: Payload) {
        precondition(declared.contains(event), "Event \(event) is not declared by the view's spec")

        guard let data = try? JSONEncoder().encode(payload),
              let fields = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            preconditionFailure("The payload of \(event) does not encode to a JSON object")
        }

        emitter.emitJSON(id, event, fields)
    }
}

/// The optional property of an event payload that crosses as `null` when
/// nil. Synthesized `Encodable` leaves nil properties out, which JavaScript
/// reads as `undefined`; a spec typed `T | null` needs the key.
@propertyWrapper
struct KuitoNullable<Value: Encodable>: Encodable {
    var wrappedValue: Value?

    init(wrappedValue: Value?) {
        self.wrappedValue = wrappedValue
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        if let wrappedValue { try container.encode(wrappedValue) } else { try container.encodeNil() }
    }
}

extension KuitoNullable: Equatable where Value: Equatable {}

/// A color prop in CSS hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`). Any
/// other text fails to decode, so the prop throws `unsupportedValue` rather
/// than showing a color the app didn't ask for.
struct KuitoHexColor: Decodable {
    let color: UIColor

    init(from decoder: Decoder) throws {
        let text = try decoder.singleValueContainer().decode(String.self)

        guard let color = UIColor(strictCSSHex: KuitoParses.of(text)) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "\(text) is not a CSS hex color"))
        }

        self.color = color
    }
}

/// The props a module's view declares, by name like the renderer's tables,
/// collected by `KuitoModuleView`:
///
///     KuitoModuleView(KuitoSliderView.self) { view in
///         view.prop("value") { (slider, value: Double?) in slider.value = Float(value ?? 0) }
///     }
final class KuitoViewDefinition<View: KuitoNativeView> {
    private(set) var props: [String: KuitoPropertySetter] = [:]

    /// A prop decoded into `Value`, any `Decodable`. A value that doesn't
    /// decode throws `unsupportedValue`, as built-in props do; make `Value`
    /// optional to accept the prop's removal, which arrives as null.
    func prop<Value: Decodable>(_ name: String, _ set: @escaping @MainActor (View, Value) -> Void) {
        precondition(props[name] == nil, "Prop \(name) is defined twice")
        props[name] = { context, value in
            guard let view = context.view as? View else { throw context.unsupportedProp() }

            do {
                set(view, try KuitoViewDefinition.decode(Value.self, value.untyped))
            } catch {
                throw context.unsupportedValue(value, "expects \(Value.self)" + KuitoViewDefinition.detail(error))
            }
        }
    }

    /// What a value's own decoding said was wrong with it, as Android's
    /// definitions report their decoding's message.
    private static func detail(_ error: Error) -> String {
        guard case DecodingError.dataCorrupted(let context) = error, !context.debugDescription.isEmpty else { return "" }

        return ": " + context.debugDescription
    }

    /// Prop values arrive as the host sends them: a string as itself, and
    /// numbers, booleans, objects and arrays as their JSON text. The JSON
    /// reading comes first, so a prop that takes a string or an object
    /// (WebView's `src`) gets the object.
    private static func decode<Value: Decodable>(_ type: Value.Type, _ value: Any?) throws -> Value {
        let decoder = JSONDecoder()

        guard let text = value as? String else {
            let data = try JSONSerialization.data(withJSONObject: value ?? NSNull(), options: [.fragmentsAllowed])

            return try decoder.decode(type, from: data)
        }

        let json: Error

        do {
            return try decoder.decode(type, from: Data(text.utf8))
        } catch {
            json = error
        }

        do {
            return try decoder.decode(type, from: JSONEncoder().encode(text))
        } catch {
            // Text that is JSON but not the value says why, rather than that it is no string;
            // other text says why the string is not the value.
            let isJSON = (try? JSONSerialization.jsonObject(with: Data(text.utf8), options: [.fragmentsAllowed])) != nil

            throw isJSON ? json : error
        }
    }
}
