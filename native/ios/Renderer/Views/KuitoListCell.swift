import UIKit

/// ListCell: one row of a native list, created by JavaScript when the list
/// first names it and re-bound to other keys after that. It is the root of
/// its own layout tree; the list measures it and decides where it shows.
@MainActor
final class KuitoListCell: UIView, KuitoLayoutRoot {
    /// The root of this row's layout tree.
    var layout: KuitoLayoutNode?
    weak var list: KuitoListView?
    /// The key JavaScript last rendered into this cell (`cellKey`).
    var renderedKey: String? {
        didSet { contentChanged() }
    }

    /// A view inside this row changed: the list measures it again.
    func contentChanged() {
        list?.cellChanged(self)
    }

    /// The list measures the row; the screen around it stays as it is.
    func subtreeChanged() -> Bool {
        contentChanged()

        return false
    }

    /// Lays the row out at `width` (NaN: as wide as its content) and returns its size.
    func measure(width: CGFloat) -> CGSize {
        guard let layout else { return .zero }

        layout.calculate(withWidth: width, height: .nan, scale: traitCollection.displayScale)

        let size = layout.frame.size

        bounds.size = size
        layout.applyFramesToChildren()

        return size
    }
}

/// A list slot: a cell id the list asked JavaScript to fill, the key it asked
/// for, and where it shows. The view exists once JavaScript has created it.
@MainActor
final class KuitoListSlot {
    let id: String
    /// Its number in the list's KuitoListCellTable.
    let number: Int32
    /// The key the table gave it: KuitoListCells writes it, nothing else.
    var key: String?
    var view: KuitoListCell?
    weak var shell: KuitoListShell?
    /// The row was measured for `key` and can be shown.
    var ready = false
    var dirty = false

    init(id: String, number: Int32) {
        self.id = id
        self.number = number
    }
}

/// The collection view's cell: it shows whichever slot holds its row, and
/// nothing (the row's estimated size, blank) until that row is rendered.
@MainActor
final class KuitoListShell: UICollectionViewCell {
    static let reuseIdentifier = "KuitoListShell"

    private(set) weak var slot: KuitoListSlot?

    func host(_ slot: KuitoListSlot) {
        if self.slot !== slot { release() }

        self.slot = slot
        slot.shell = self
        show()
    }

    /// Places the slot's view when it exists, visible once it is ready.
    func show() {
        guard let slot, let view = slot.view else { return }

        if view.superview !== contentView { contentView.addSubview(view) }

        view.frame.origin = .zero
        view.isHidden = !slot.ready
    }

    func release() {
        guard let slot else { return }

        if slot.shell === self { slot.shell = nil }

        if slot.view?.superview === contentView { slot.view?.removeFromSuperview() }

        self.slot = nil
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        release()
    }
}
