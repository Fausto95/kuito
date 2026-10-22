import UIKit

/// `ContextMenu` in native/modules/context-menu/context-menu.ts: a plain
/// view around its children, laid out by the engine as a Box, with a
/// UIContextMenuInteraction whose long press lifts the view and lists its
/// items. Its props are defined here, beside the view, so the renderer tests
/// reach them without the generated spec.
final class KuitoContextMenuView: UIView, KuitoNativeView, UIContextMenuInteractionDelegate {
    static func define(_ view: KuitoViewDefinition<KuitoContextMenuView>) {
        view.prop("items") { (menu, value: Items?) in menu.list = value?.list ?? [] }
        view.prop("title") { (menu, value: String?) in menu.title = value ?? "" }
        view.prop("disabled") { (menu, value: Bool?) in menu.disabled = value ?? false }
    }

    struct Item: Decodable {
        let value: String
        let label: String
        let destructive: Bool?
        let disabled: Bool?
    }

    /// Items whose values differ: a value names one item.
    struct Items: Decodable {
        let list: [Item]

        init(from decoder: Decoder) throws {
            list = try decoder.singleValueContainer().decode([Item].self)

            guard Set(list.map(\.value)).count == list.count else {
                throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "two items have the same value"))
            }
        }
    }

    private let events: KuitoViewEvents
    private var list: [Item] = []
    private var title = ""
    private var disabled = false

    init(events: KuitoViewEvents) {
        self.events = events
        super.init(frame: .zero)
        addInteraction(UIContextMenuInteraction(delegate: self))
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    /// The menu a long press opens, or nil while it opens none.
    func items() -> UIMenu? {
        guard !disabled, !list.isEmpty else { return nil }

        return UIMenu(title: title, children: list.map { item in
            var attributes: UIMenuElement.Attributes = []

            if item.destructive == true { attributes.insert(.destructive) }
            if item.disabled == true { attributes.insert(.disabled) }

            return UIAction(title: item.label, attributes: attributes) { [weak self] _ in self?.picked(item.value) }
        })
    }

    /// What a menu action calls with its item's value.
    func picked(_ value: String) {
        events.emit("select", Selected(value: value))
    }

    func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configurationForMenuAtLocation location: CGPoint) -> UIContextMenuConfiguration? {
        // Read when the menu opens, so it lists the items the props hold then.
        guard let menu = items() else { return nil }

        return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { _ in menu }
    }
}

private struct Selected: Encodable {
    let value: String
}
