import UIKit

/// What scroll props set on a ScrollView or a List.
@MainActor
protocol KuitoScrollable: AnyObject {
    var emitsScroll: Bool { get set }
    /// Sends the view's `motion` events while on (docs/motion.md#motion-sources).
    var motion: KuitoScrollMotion { get }
    var scrollEventThrottle: TimeInterval { get set }
    var endReachedThreshold: CGFloat { get set }
    var refreshable: Bool { get set }
    var refreshing: Bool { get set }
    var showsVerticalScrollIndicator: Bool { get set }
    var showsHorizontalScrollIndicator: Bool { get set }
    /// The view that scrolls: the keyboard props act on it.
    var scroller: UIScrollView { get }
    /// Only content that scrolls vertically can scroll out from under the keyboard.
    var horizontal: Bool { get }
    /// Content drawn upside down, as an inverted list's is: its top inset is at the bottom on screen.
    var flipped: Bool { get }
    /// Insets the content by the part the keyboard covers (see KuitoKeyboard).
    var automaticallyAdjustsKeyboardInsets: Bool { get set }
    /// A scroll request: `{ offset, animated }`, `{ end, animated }` or a ScrollView's `{ page, animated }`, and a list's `{ key, ... }`.
    func scroll(to request: KuitoScrollRequestValue) throws
    /// No request: one still settling is dropped.
    func cancelScroll()
}

extension KuitoScrollView: KuitoScrollable {
    var scroller: UIScrollView { self }
    var flipped: Bool { false }
}

/// Scrolling behavior: events, end-reached, pull-to-refresh, indicators, requests and where a drag rests.
@MainActor
enum KuitoScrollProperties {
    static let setters: [String: KuitoPropertySetter] = [
        "emitsScroll": scroll { context, view, value in view.emitsScroll = try context.flag(value) },
        "scrollInterval": scroll { context, view, value in
            view.scrollEventThrottle = max(try context.number(value), 0) / 1000
        },
        "reachEndThreshold": scroll { context, view, value in
            view.endReachedThreshold = max(try context.number(value), 0)
        },
        "refreshable": scroll { context, view, value in view.refreshable = try context.flag(value) },
        "refreshing": scroll { context, view, value in view.refreshing = try context.flag(value) },
        // A request, not state: each value received scrolls once; null cancels one still pending.
        "scrollTo": scroll { context, view, value in
            guard value != .null else { return view.cancelScroll() }

            try view.scroll(to: try context.structure(value, KuitoPropValues.scrollTo))
        },
        "paging": on(KuitoScrollView.self) { context, view, value in view.isPagingEnabled = try context.flag(value) },
        "snapOffsets": on(KuitoScrollView.self) { context, view, value in
            view.snapOffsets = try context.structure(value, KuitoPropValues.snapOffsets).map { CGFloat($0) }
        },
        // A view scrolls on one axis, so one flag covers its one scrollbar.
        "scrollbar": scroll { context, view, value in
            let shown = try context.flag(value)

            view.showsVerticalScrollIndicator = shown
            view.showsHorizontalScrollIndicator = shown
        },
    ]

    private static func scroll(
        _ apply: @escaping @MainActor (KuitoPropertyContext, KuitoScrollable, KuitoValue) throws -> Void
    ) -> KuitoPropertySetter {
        { context, value in
            guard let view = context.view as? KuitoScrollable else { throw context.unsupportedProp() }

            try apply(context, view, value)
        }
    }
}
