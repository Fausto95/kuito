import UIKit

/// One button of a screen's header (docs/navigation.md#headers): its label,
/// the SF Symbol shown instead, and which side of the title it sits on.
struct KuitoHeaderItem: Equatable {
    let label: String
    let image: UIImage?
    let disabled: Bool
    let leading: Bool

    /// The `headerItems` prop's items, in order: their index is what a press reports.
    static func list(_ items: [KuitoHeaderItemValue]) throws -> [KuitoHeaderItem] {
        try items.map { item in
            KuitoHeaderItem(
                label: item.label, image: try symbol(item.icon), disabled: item.disabled ?? false,
                leading: item.placement == .leading
            )
        }
    }

    /// A symbol name, or `{ ios, android }` names: iOS takes its own.
    private static func symbol(_ icon: KuitoHeaderIconValue?) throws -> UIImage? {
        let name: String? = switch icon {
        case .symbol(let name): name
        case .platforms(let names): names.ios
        case nil: nil
        }

        guard let name else { return nil }

        guard let image = UIImage(systemName: name) else { throw KuitoRenderError.Rejection("no SF Symbol is named \(name)") }

        return image
    }
}

/// The header's search field: the placeholder it shows.
struct KuitoHeaderSearch: Equatable {
    let placeholder: String?

    init(_ search: KuitoHeaderSearchValue) {
        placeholder = search.placeholder
    }
}

/// The screen's header slot on its navigation item: bar buttons on either
/// side of the title, the large title's display mode and a search
/// controller. Presses and search text report as the screen's events.
extension KuitoNavigationScreenController: UISearchResultsUpdating, UISearchBarDelegate {
    func showHeader() {
        showItems()
        showLargeTitle()
        showSearch()
    }

    func showItems() {
        let buttons = screen.headerItems.enumerated().map { index, item in
            let button = UIBarButtonItem(title: item.label, image: item.image, target: self, action: #selector(pressed(_:)), menu: nil)

            button.tag = index
            button.accessibilityLabel = item.label
            button.isEnabled = !item.disabled

            return (item.leading, button)
        }

        navigationItem.leftItemsSupplementBackButton = true
        navigationItem.leftBarButtonItems = buttons.filter(\.0).map(\.1)
        navigationItem.rightBarButtonItems = buttons.filter { !$0.0 }.map(\.1)
    }

    func showLargeTitle() {
        navigationItem.largeTitleDisplayMode = screen.largeTitle ? .always : .never
    }

    func showSearch() {
        guard let search = screen.search else {
            // An active search presents over the screen: end it before it goes.
            navigationItem.searchController?.isActive = false
            navigationItem.searchController = nil
            searchedText = nil

            return
        }

        if navigationItem.searchController == nil { searchedText = "" }

        let controller = navigationItem.searchController ?? UISearchController(searchResultsController: nil)

        controller.searchResultsUpdater = self
        controller.searchBar.delegate = self
        controller.obscuresBackgroundDuringPresentation = false
        controller.searchBar.placeholder = search.placeholder
        navigationItem.searchController = controller
        // Shown from the start: the screen's scroll view does not drive the bar.
        navigationItem.hidesSearchBarWhenScrolling = false
        definesPresentationContext = true
    }

    @objc private func pressed(_ button: UIBarButtonItem) {
        screen.emit?("headeritem", KuitoIndexPayload(index: Double(button.tag)))
    }

    // UIKit also asks when the field gains or loses focus: only a new text reports.
    func updateSearchResults(for searchController: UISearchController) {
        let text = searchController.searchBar.text ?? ""

        guard text != searchedText else { return }

        searchedText = text
        screen.emit?("search", KuitoTextPayload(text: text))
    }

    func searchBarSearchButtonClicked(_ searchBar: UISearchBar) {
        screen.emit?("searchsubmit", KuitoTextPayload(text: searchBar.text ?? ""))
    }
}
