import UIKit

/// The view a linked module contributes (docs/native-modules.md#views): how
/// to make it and its props by name. The link table registers its kind with
/// the renderer the first time the kernel plans one.
struct KuitoModuleView {
    private let make: (_ events: [String]) -> KuitoModuleViewKind

    init<View: KuitoNativeView>(_ type: View.Type, _ define: (KuitoViewDefinition<View>) -> Void) {
        let definition = KuitoViewDefinition<View>()

        define(definition)

        let props = definition.props

        make = { events in
            let declared = Set(events)

            return KuitoModuleViewKind(
                make: { id, emitter in
                    let view = View(events: KuitoViewEvents(id: id, emitter: emitter, declared: declared))

                    KuitoModuleViews.shared.mount(id, view)

                    // A module's view may hold children (a host) or keep its record.
                    return KuitoCreatedView(view: view, host: view as? KuitoHost, styled: view as? KuitoStyled)
                },
                props: props)
        }
    }

    /// The kind the renderer makes, with the events the spec declares.
    func kind(events: [String]) -> KuitoModuleViewKind {
        make(events)
    }
}

extension KuitoModuleViews {
    /// The mounted view a view method's first argument names.
    @MainActor func linked(_ id: Double) throws -> UIView {
        guard let number = UInt32(exactly: id), let view = view(number) else {
            throw KuitoModuleError(KuitoErrorCode.viewNotFound, "No view \(id) is mounted")
        }

        return view
    }
}
