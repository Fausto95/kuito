import UIKit

/// A native list's rows, columns and scroll requests, and the key a cell
/// shows (docs/lists.md).
@MainActor
enum KuitoListProperties {
    static let setters: [String: KuitoPropertySetter] = [
        "keys": remeasured(on(KuitoListView.self) { context, view, value in
            switch value {
            case .keys(let edits): try view.edit(keys: edits)
            case .null: view.setKeys([])
            default: throw context.unsupportedValue(value, "expects a key diff")
            }
        }),
        "spanningKeys": remeasured(on(KuitoListView.self) { context, view, value in
            view.layout.spanningKeys = Set(try context.structure(value, KuitoPropValues.spanningKeys))
        }),
        "stickyKeys": on(KuitoListView.self) { context, view, value in
            view.layout.stickyKeys = Set(try context.structure(value, KuitoPropValues.stickyKeys))
            view.setNeedsLayout()
        },
        "numColumns": remeasured(on(KuitoListView.self) { context, view, value in
            view.layout.numColumns = max(Int(try context.number(value)), 1)
            view.invalidateRows()
        }),
        "inverted": on(KuitoListView.self) { context, view, value in view.inverted = try context.flag(value) },
        "estimatedItemSize": remeasured(on(KuitoListView.self) { context, view, value in
            view.layout.estimatedLength = value == .null ? nil : max(try context.number(value), 1)
        }),
        "initialScrollKey": on(KuitoListView.self) { context, view, value in
            view.initialScrollKey = value == .null ? nil : try context.text(value)
        },
        "emitsViewable": on(KuitoListView.self) { context, view, value in view.emitsViewable = try context.flag(value) },
        "viewableThreshold": on(KuitoListView.self) { context, view, value in
            view.viewableThreshold = min(max(try context.number(value), 0), 1)
        },
        "cellKey": on(KuitoListCell.self) { context, cell, value in
            cell.renderedKey = value == .null ? nil : try context.text(value)
        },
    ]
}
