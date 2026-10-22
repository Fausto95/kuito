import UIKit

/// A created view; the view that holds its children when that is not the
/// view itself (a ScrollView's content); and what it is to the renderer,
/// known from the view's type where it is made: a host of its children, a
/// view it styles.
struct KuitoCreatedView {
    let view: UIView
    var content: UIView?
    var host: KuitoHost?
    var styled: KuitoStyled?

    /// Generic, like the overloads below, so the most constrained one is the
    /// one Swift picks for a view's type.
    init(view: some UIView, content: UIView? = nil, host: KuitoHost? = nil, styled: KuitoStyled? = nil) {
        self.view = view
        self.content = content
        self.host = host
        self.styled = styled
    }

    init(view: some KuitoStyled) {
        self.init(view: view, content: nil, host: nil, styled: view)
    }

    init(view: some KuitoHost) {
        self.init(view: view, content: nil, host: view, styled: nil)
    }

    init(view: some KuitoHost & KuitoStyled) {
        self.init(view: view, content: nil, host: view, styled: view)
    }
}

/// Builds the UIKit view for each Kuito kind and wires its native events.
@MainActor
enum KuitoViewFactory {
    typealias Make = @MainActor (UInt32, KuitoEventEmitter) -> KuitoCreatedView

    /// Kinds that are pages of a container, by the container's kind: the
    /// renderer hands them to that container and nowhere else.
    static let pages: [String: String] = [
        "NavigationScreen": "NavigationStack",
        "NavigationTab": "NavigationTabs",
    ]

    /// How to make a kind's view: built in, or contributed by a native module.
    static func make(_ kind: String) -> Make? {
        kinds[kind] ?? KuitoModuleViews.shared.kind(kind)?.make
    }

    /// Props a kind owns ahead of the shared tables in KuitoProperties: a
    /// module's view declares its own.
    static func props(_ kind: String) -> [String: KuitoPropertySetter] {
        KuitoModuleViews.shared.kind(kind)?.props ?? [:]
    }

    private static let kinds: [String: Make] = [
        "VStack": { _, _ in KuitoCreatedView(view: UIView()) },
        "HStack": { _, _ in KuitoCreatedView(view: UIView()) },
        "Sheet": { id, events in
            let sheet = KuitoSheetView()

            sheet.emit = { event, payload in events.emit(id, event, payload) }

            return KuitoCreatedView(view: sheet)
        },
        "SafeArea": { _, _ in KuitoCreatedView(view: KuitoSafeAreaView()) },
        "NavigationStack": { id, events in
            let stack = KuitoNavigationStackView()

            stack.emit = { event, payload in events.emit(id, event, payload) }

            return KuitoCreatedView(view: stack)
        },
        "NavigationScreen": { id, events in
            let screen = KuitoNavigationScreenView()

            screen.emit = { event, payload in events.emit(id, event, payload) }

            return KuitoCreatedView(view: screen)
        },
        "NavigationTabs": { id, events in
            let tabs = KuitoNavigationTabsView()

            tabs.emit = { event, payload in events.emit(id, event, payload) }

            return KuitoCreatedView(view: tabs)
        },
        "NavigationTab": { id, events in
            let tab = KuitoNavigationTabView()

            tab.emit = { event, payload in events.emit(id, event, payload) }

            return KuitoCreatedView(view: tab)
        },
        "Pressable": { id, events in
            let pressable = KuitoPressableView()

            pressable.emit = { phase, location in events.emit(id, phase, location) }

            return KuitoCreatedView(view: pressable)
        },
        "Box": { _, _ in KuitoCreatedView(view: UIView()) },
        "Scroll": { id, events in scrollView(id, events, horizontal: false) },
        "HorizontalScroll": { id, events in scrollView(id, events, horizontal: true) },
        "List": { id, events in list(id, events, horizontal: false) },
        "HorizontalList": { id, events in list(id, events, horizontal: true) },
        "ListCell": { _, _ in KuitoCreatedView(view: KuitoListCell()) },
        "TextField": { id, events in KuitoCreatedView(view: textField(id, events)) },
        "MultilineTextField": { id, events in KuitoCreatedView(view: textView(id, events)) },
        "Image": { id, events in
            let image = KuitoImageView(frame: .zero)

            image.emit = { phase, payload in events.emit(id, phase, payload) }

            return KuitoCreatedView(view: image)
        },
        "Symbol": { _, _ in KuitoCreatedView(view: KuitoSymbolView(frame: .zero)) },
        "Spacer": { _, _ in KuitoCreatedView(view: UIView()) },
        "Divider": { _, _ in
            let line = UIView()

            line.backgroundColor = .separator

            return KuitoCreatedView(view: line)
        },
        "Toggle": { id, events in
            let toggle = UISwitch()

            toggle.addAction(UIAction { [weak toggle] _ in
                events.emit(id, "change", KuitoValuePayload(value: toggle?.isOn ?? false))
            }, for: .valueChanged)

            return KuitoCreatedView(view: toggle)
        },
        "Spinner": { _, _ in
            let spinner = UIActivityIndicatorView(style: .medium)

            spinner.startAnimating() // Spins until `animating` is false, as on Android.

            return KuitoCreatedView(view: spinner)
        },
        "Text": { _, _ in
            let label = KuitoLabel()

            label.numberOfLines = 0 // Text wraps by default, like React Native.

            return KuitoCreatedView(view: label)
        },
        "Button": { id, events in
            let button = UIButton(type: .system)

            button.addAction(UIAction { _ in events.emit(id, "press") }, for: .touchUpInside)

            return KuitoCreatedView(view: button)
        },
    ]

    private static func scrollView(_ id: UInt32, _ events: KuitoEventEmitter, horizontal: Bool) -> KuitoCreatedView {
        let scroll = KuitoScrollView(horizontal: horizontal)

        scroll.emit = { event, payload in events.emit(id, event, payload) }

        return KuitoCreatedView(view: scroll, content: scroll.content)
    }

    private static func list(_ id: UInt32, _ events: KuitoEventEmitter, horizontal: Bool) -> KuitoCreatedView {
        let list = KuitoListView(id: "__kuito:list-\(id)", horizontal: horizontal)

        list.emit = { event, payload in events.emit(id, event, payload) }

        return KuitoCreatedView(view: list)
    }

    private static func textView(_ id: UInt32, _ events: KuitoEventEmitter) -> KuitoTextView {
        let view = KuitoTextView()

        view.emit = { event, payload in events.emit(id, event, payload) }

        return view
    }

    private static func textField(_ id: UInt32, _ events: KuitoEventEmitter) -> KuitoTextField {
        let field = KuitoTextField()
        let text = { [weak field] in KuitoTextPayload(text: field?.text ?? "") }

        field.emit = { event, payload in events.emit(id, event, payload) }
        field.borderStyle = .roundedRect
        field.addAction(UIAction { [weak field] _ in field?.userEdited() }, for: .editingChanged)
        field.addAction(UIAction { _ in events.emit(id, "focus") }, for: .editingDidBegin)
        field.addAction(UIAction { [weak field] _ in
            field?.compositionEnded()
            events.emit(id, "blur")
        }, for: .editingDidEnd)
        // Not editingDidEndOnExit, which always ends editing: submitBehavior decides.
        field.addAction(UIAction { [weak field] _ in
            events.emit(id, "submit", text())
            field?.submitted()
        }, for: .primaryActionTriggered)

        return field
    }
}
