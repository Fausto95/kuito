import UIKit

/// The cells a list's rows are rendered into, and which shows which key. A
/// key keeps its cell; a new key takes the least recently used cell outside
/// the window, else a new one, and JavaScript is asked to render it
/// (`onBind`). The choice is the shared table's (native/shared/ListCells.h);
/// this keeps the views, as `KuitoListCells` does on Android.
@MainActor
final class KuitoListCells {
    private let table: KuitoListCellTable
    /// Asks JavaScript to render `key` into `cell`.
    var onBind: ((_ cell: String, _ key: String) -> Void)?
    private(set) var all: [KuitoListSlot] = []
    private var slotsByNumber: [Int32: KuitoListSlot] = [:]

    init(listID: String) {
        table = KuitoListCellTable(list: listID)
    }

    /// The keys the list renders ahead: their cells are not reused.
    func setWindow(_ keys: [String]) {
        table.setWindow(keys)
    }

    /// The slot that shows `key`: the one already holding it, else a free
    /// one (least recently used), else a new one.
    func slot(for key: String) -> KuitoListSlot {
        let found = table.find(key)

        if found >= 0, let slot = slotsByNumber[found] { return slot }

        let number = table.place(key, held: all.filter { $0.shell != nil }.map { NSNumber(value: $0.number) })
        let slot = slotsByNumber[number] ?? add(number)

        slot.key = key
        slot.ready = false
        slot.dirty = false
        slot.view?.isHidden = true
        onBind?(slot.id, key)

        return slot
    }

    /// The slot JavaScript's cell `id` fills: one this list named, or (after
    /// a reconnect) a new one.
    func adopt(_ cell: KuitoListCell, id: String) -> KuitoListSlot {
        let number = table.adopt(id)
        let slot = slotsByNumber[number] ?? add(number)

        slot.view = cell

        return slot
    }

    /// Forgets `cell`'s slot; the slot it had, if any.
    func remove(_ cell: KuitoListCell) -> KuitoListSlot? {
        guard let index = all.firstIndex(where: { $0.view === cell }) else { return nil }

        let slot = all.remove(at: index)

        slotsByNumber[slot.number] = nil
        table.remove(slot.number)

        return slot
    }

    func slot(of cell: KuitoListCell) -> KuitoListSlot? {
        all.first { $0.view === cell }
    }

    /// A replayed cell joins with the key it shows, unless another holds that key.
    func join(_ slot: KuitoListSlot, key: String?) {
        guard let key, table.join(slot.number, key: key) else { return }

        slot.key = key
    }

    private func add(_ number: Int32) -> KuitoListSlot {
        let slot = KuitoListSlot(id: table.id(of: number), number: number)

        all.append(slot)
        slotsByNumber[number] = slot

        return slot
    }
}
