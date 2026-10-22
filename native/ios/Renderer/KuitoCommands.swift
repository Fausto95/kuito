import UIKit

/// What a command needs: its target view (none for an app-wide command), its
/// argument, and the renderer's keyboard and accessibility state.
@MainActor
struct KuitoCommandContext {
    let name: String
    let view: UIView?
    /// The target as errors name it.
    let target: String
    let argument: String
    let root: UIView
    let keyboard: KuitoKeyboard
    let accessibility: KuitoAccessibilityMonitor
    let devtools: KuitoDevtoolsOverlay?
    let lookup: (UInt32) -> UIView?

    func targetView() throws -> UIView {
        guard let view else { throw KuitoRenderError.unsupportedProp(prop: name, view: target) }

        return view
    }

    func overlay() throws -> KuitoDevtoolsOverlay {
        guard let devtools else { throw KuitoRenderError.unsupportedProp(prop: name, view: "a release build") }

        return devtools
    }

    func field() throws -> UIView {
        let view = try targetView()

        guard view is KuitoTextInput else { throw KuitoRenderError.unsupportedProp(prop: name, view: target) }

        return view
    }
}

/// The devtools' hands on the device: outlines for the views of the
/// Components panel's selection, a tap that picks a view, and the cause of
/// each update the highlighter flashes.
@MainActor
public protocol KuitoDevtoolsOverlay: AnyObject {
    func highlight(_ views: [UIView])
    func inspect(_ enabled: Bool)
    /// A new runtime asks whether updates are highlighted (the `devtools.updates` event).
    func hello()
    /// The signal write behind `view`'s update in this batch (`visits = 2`).
    func cause(_ view: UIView, _ text: String)
}

/// `devtoolsCause`'s argument: `[view, cause]`.
private struct KuitoCause: Decodable {
    let view: UInt32
    let text: String

    init(from decoder: Decoder) throws {
        var fields = try decoder.unkeyedContainer()

        view = try fields.decode(UInt32.self)
        text = try fields.decode(String.self)
    }
}

/// One-shot instructions from JavaScript, by name, applied in order with the
/// view mutations around them.
@MainActor
enum KuitoCommands {
    static let all: [String: @MainActor (KuitoCommandContext) throws -> Void] = [
        "focus": { context in try context.field().becomeFirstResponder() },
        "blur": { context in try context.field().resignFirstResponder() },
        "keyboard.dismiss": { context in context.root.window?.endEditing(true) },
        // keyboard.height: its moves go out every frame while on (docs/keyboard.md#keyboard).
        "keyboard.motion": { context in context.keyboard.motion.on = context.argument == "on" },
        "accessibility.announce": { context in try context.accessibility.announce(context.argument) },
        "accessibility.focus": { context in context.accessibility.focus(try context.targetView()) },
        "accessibility.status": { context in context.accessibility.sendStatus() },
        // The Components panel (docs/devtools.md): outline these views; pick one by tapping.
        "devtoolsHighlight": { context in
            let ids = try JSONDecoder().decode([UInt32].self, from: Data(context.argument.utf8))

            try context.overlay().highlight(ids.compactMap(context.lookup))
        },
        "devtoolsInspect": { context in try context.overlay().inspect(context.argument == "on") },
        "devtoolsHello": { context in try context.overlay().hello() },
        // A layout-only view has no native view to flash: its cause has nowhere to show.
        "devtoolsCause": { context in
            let cause = try JSONDecoder().decode(KuitoCause.self, from: Data(context.argument.utf8))

            if let view = context.lookup(cause.view) { try context.overlay().cause(view, cause.text) }
        },
    ]
}
