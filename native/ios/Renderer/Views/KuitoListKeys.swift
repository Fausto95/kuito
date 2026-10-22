import Foundation

/// A list's keys arrive as edits to the keys it has (docs/lists.md#keys),
/// applied by the shared editor (native/shared/ListKeys.h).
extension Array where Element == KuitoKeyEdit {
    /// `keys` with each edit applied to the keys the edits before it left.
    /// An edit that does not fit throws, naming it, and the keys stay as they were.
    func applied(to keys: [String]) throws -> [String] {
        let order: Data

        do {
            order = try KuitoListKeyEdits.order(
                of: keys,
                ops: map { NSNumber(value: $0.op.rawValue) },
                indices: map { NSNumber(value: $0.index) },
                keys: map(\.key)
            )
        } catch {
            throw KuitoRenderError.Rejection((error as NSError).localizedDescription)
        }

        return order.withUnsafeBytes { bytes in
            bytes.bindMemory(to: Int32.self).map { $0 >= 0 ? keys[Int($0)] : self[Int(~$0)].key }
        }
    }
}
