import UIKit

/// Navigation screens' headers, tabs' bar items and the tab selection
/// (docs/navigation.md).
@MainActor
enum KuitoNavigationProperties {
    static let setters: [String: KuitoPropertySetter] = [
        "title": { context, value in
            guard let page = context.view as? KuitoPage else { throw context.unsupportedProp() }

            page.title = value == .null ? nil : try context.text(value)
        },
        "header": on(KuitoNavigationScreenView.self) { context, view, value in
            view.headerShown = try context.flag(value)
        },
        "headerItems": on(KuitoNavigationScreenView.self) { context, view, value in
            view.headerItems = value == .null ? [] : try KuitoHeaderItem.list(context.structure(value, KuitoPropValues.headerItems))
        },
        "largeTitle": on(KuitoNavigationScreenView.self) { context, view, value in
            view.largeTitle = try context.flag(value)
        },
        "search": on(KuitoNavigationScreenView.self) { context, view, value in
            view.search = value == .null ? nil : KuitoHeaderSearch(try context.structure(value, KuitoPropValues.search))
        },
        // An SF Symbol name, { ios, android } names, or { uri }.
        "icon": on(KuitoNavigationTabView.self) { context, view, value in
            guard value != .null else { return try KuitoNavigationProperties.icon(named: nil, on: view) }

            switch try context.structure(value, KuitoPropValues.icon) {
            case .symbol(let name):
                try KuitoNavigationProperties.icon(named: name, on: view)
            case .image(let image):
                guard let url = URL(string: image.uri) else { throw KuitoRenderError.Rejection("{ uri } needs a URL") }

                view.load(icon: url)
            case .platforms(let names):
                try KuitoNavigationProperties.icon(named: names.ios, on: view)
            }
        },
        // Any view: the stack reads it when it pushes or pops (KuitoSharedTransition).
        "sharedId": { context, value in
            context.style.sharedId = value == .null ? nil : try context.text(value)
        },
        "selectedIndex": on(KuitoNavigationTabsView.self) { context, view, value in
            let index = try context.number(value)

            guard index >= 0, index == index.rounded() else {
                throw KuitoRenderError.Rejection("expects a tab index")
            }

            view.selectedIndex = Int(index)
        },
    ]

    /// An SF Symbol by name; none clears the icon.
    private static func icon(named name: String?, on view: KuitoNavigationTabView) throws {
        view.load(icon: nil)

        guard let name else { return view.icon = nil }

        guard let image = UIImage(systemName: name) else {
            throw KuitoRenderError.Rejection("no SF Symbol is named \(name)")
        }

        view.icon = image
    }
}
