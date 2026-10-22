import UIKit

/// The geometry of a native list: where each row sits, from the sizes its
/// rows measured and an estimate for the rest. Rows stack along the axis;
/// in a grid, rows that do not span fill `numColumns` columns, and a line is
/// as long as its longest row. The list owns no other copy of keys or sizes.
@MainActor
final class KuitoListLayout: UICollectionViewLayout {
    let horizontal: Bool

    var keys: [String] = [] { didSet { reindex() } }
    var spanningKeys: Set<String> = [] { didSet { invalidateGeometry() } }
    /// Rows that stay at the top of the viewport while their section scrolls under them.
    var stickyKeys: Set<String> = [] { didSet { reindexSticky() } }
    var numColumns = 1 { didSet { invalidateGeometry() } }
    /// Between lines of a vertical list, as in a flex column.
    var rowGap: CGFloat = 0 { didSet { invalidateGeometry() } }
    /// Between a grid's columns, and between rows of a horizontal list, as in a flex row.
    var columnGap: CGFloat = 0 { didSet { invalidateGeometry() } }
    var inverted = false { didSet { invalidateLayout() } }
    /// The list's padding, around its rows.
    var insets = UIEdgeInsets.zero { didSet { invalidateGeometry() } }
    var estimatedLength: CGFloat? { didSet { invalidateGeometry() } }

    private(set) var indexOfKey: [String: Int] = [:]
    /// Positions of the sticky rows, in order.
    private var stickyIndices: [Int] = []
    /// Measured row sizes by key, kept when a row is recycled or removed so
    /// that a row seen before comes back at its real size.
    private var sizes: [String: CGSize] = [:]
    private var measuredLength: CGFloat = 0
    private var frames: [CGRect] = []
    private var contentLength: CGFloat = 0
    private var geometryWidth: CGFloat = -1
    private var stale = true

    init(horizontal: Bool) {
        self.horizontal = horizontal
        super.init()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    // MARK: - Sizes

    /// A row not measured yet: the estimate, else the average measured row.
    var placeholderLength: CGFloat {
        if let estimatedLength { return estimatedLength }

        return sizes.isEmpty ? 44 : measuredLength / CGFloat(sizes.count)
    }

    /// The tallest row of a horizontal list, the widest of a vertical one.
    var crossExtent: CGFloat {
        sizes.values.reduce(0) { max($0, horizontal ? $1.height : $1.width) }
    }

    func size(of key: String) -> CGSize? { sizes[key] }

    /// Records a row's measured size; true when it changed.
    @discardableResult
    func setSize(_ size: CGSize, of key: String) -> Bool {
        let previous = sizes[key]

        guard previous != size else { return false }

        measuredLength += main(size) - (previous.map(main) ?? 0)
        sizes[key] = size
        invalidateGeometry()

        return true
    }

    /// The width a row lays out in: its column's, or none in a horizontal list.
    func crossLength(for key: String) -> CGFloat {
        guard !horizontal else { return .nan }

        let width = max(viewportCross - insets.left - insets.right, 0)

        guard numColumns > 1, !spanningKeys.contains(key) else { return width }

        return max((width - columnGap * CGFloat(numColumns - 1)) / CGFloat(numColumns), 0)
    }

    // MARK: - Geometry

    func frame(at index: Int) -> CGRect? {
        recomputeIfNeeded()

        return frames.indices.contains(index) ? frames[index] : nil
    }

    /// The scrollable length of every row, with the padding.
    var totalLength: CGFloat {
        recomputeIfNeeded()

        return contentLength
    }

    /// Indices of the rows meeting `rect`, in order.
    func indices(in rect: CGRect) -> Range<Int> {
        recomputeIfNeeded()

        guard !frames.isEmpty else { return 0..<0 }

        let start = horizontal ? rect.minX : rect.minY
        let end = horizontal ? rect.maxX : rect.maxY
        // The last line starting at or before `start`: only it can reach into the rect from above.
        var low = 0, high = frames.count - 1, first = 0

        while low <= high {
            let middle = (low + high) / 2

            if lineStart(frames[middle]) <= start {
                first = middle
                low = middle + 1
            } else {
                high = middle - 1
            }
        }

        while first > 0, lineStart(frames[first - 1]) == lineStart(frames[first]) { first -= 1 }

        var last = first

        while last < frames.count, lineStart(frames[last]) < end { last += 1 }

        return first..<max(last, first)
    }

    func invalidateGeometry() {
        stale = true
        invalidateLayout()
    }

    private func reindex() {
        var index: [String: Int] = [:]

        index.reserveCapacity(keys.count)

        for (position, key) in keys.enumerated() { index[key] = position }

        indexOfKey = index
        reindexSticky()
        invalidateGeometry()
    }

    private func reindexSticky() {
        stickyIndices = stickyKeys.compactMap { indexOfKey[$0] }.sorted()
        invalidateLayout()
    }

    // MARK: - Sticky rows

    /// The top of the viewport, where a sticky row pins.
    private var viewportTop: CGFloat {
        guard let collectionView else { return 0 }

        return collectionView.contentOffset.y + collectionView.contentInset.top
    }

    /// The sticky row pinned now and where it shows: the last one starting
    /// at or above the viewport's top, pushed up by the next one's arrival.
    /// Vertical lists only.
    func pinned() -> (index: Int, y: CGFloat)? {
        recomputeIfNeeded()

        let top = viewportTop

        guard !horizontal, let at = stickyIndices.lastIndex(where: { frames.indices.contains($0) && frames[$0].minY <= top }) else {
            return nil
        }

        let index = stickyIndices[at]
        let next = stickyIndices.dropFirst(at + 1).first { frames.indices.contains($0) }
        let y = next.map { min(top, frames[$0].minY - frames[index].height) } ?? top

        return (index, y)
    }

    private var viewportCross: CGFloat {
        let bounds = collectionView?.bounds ?? .zero

        return horizontal ? bounds.height : bounds.width
    }

    private func main(_ size: CGSize) -> CGFloat { horizontal ? size.width : size.height }

    private func lineStart(_ frame: CGRect) -> CGFloat { horizontal ? frame.minX : frame.minY }

    private func length(of key: String) -> CGFloat { sizes[key].map(main) ?? placeholderLength }

    private func recomputeIfNeeded() {
        let cross = viewportCross

        guard stale || cross != geometryWidth else { return }

        stale = false
        geometryWidth = cross
        frames = horizontal ? horizontalFrames() : verticalFrames()
    }

    private func verticalFrames() -> [CGRect] {
        var frames = [CGRect](repeating: .zero, count: keys.count)
        let width = max(geometryWidth - insets.left - insets.right, 0)
        let columns = max(numColumns, 1)
        let columnWidth = max((width - columnGap * CGFloat(columns - 1)) / CGFloat(columns), 0)
        var y = insets.top
        var index = 0

        while index < keys.count {
            if columns == 1 || spanningKeys.contains(keys[index]) {
                let height = length(of: keys[index])

                frames[index] = CGRect(x: insets.left, y: y, width: width, height: height)
                y += height + rowGap
                index += 1

                continue
            }

            var line: CGFloat = 0
            var column = 0

            while index < keys.count, column < columns, !spanningKeys.contains(keys[index]) {
                let height = length(of: keys[index])
                let x = insets.left + CGFloat(column) * (columnWidth + columnGap)

                frames[index] = CGRect(x: x, y: y, width: columnWidth, height: height)
                line = max(line, height)
                column += 1
                index += 1
            }

            y += line + rowGap
        }

        contentLength = (keys.isEmpty ? y : y - rowGap) + insets.bottom

        return frames
    }

    /// A horizontal list is one line: rows keep their measured height.
    private func horizontalFrames() -> [CGRect] {
        var x = insets.left
        let frames = keys.map { key -> CGRect in
            let size = sizes[key] ?? CGSize(width: placeholderLength, height: crossExtent)
            let frame = CGRect(x: x, y: insets.top, width: size.width, height: size.height)

            x += size.width + columnGap

            return frame
        }

        contentLength = (keys.isEmpty ? x : x - columnGap) + insets.right

        return frames
    }

    // MARK: - UICollectionViewLayout

    override var collectionViewContentSize: CGSize {
        let length = totalLength

        return horizontal
            ? CGSize(width: length, height: viewportCross)
            : CGSize(width: viewportCross, height: length)
    }

    override func prepare() {
        super.prepare()
        recomputeIfNeeded()
    }

    override func layoutAttributesForElements(in rect: CGRect) -> [UICollectionViewLayoutAttributes]? {
        let pin = pinned()
        var found = indices(in: rect).compactMap { index in
            frames[index].intersects(rect) && index != pin?.index ? attributes(at: index) : nil
        }

        // The pinned row shows wherever it is pinned, even far from its own place.
        if let pin, let pinned = layoutAttributesForItem(at: IndexPath(item: pin.index, section: 0)), pinned.frame.intersects(rect) {
            found.append(pinned)
        }

        return found
    }

    override func layoutAttributesForItem(at indexPath: IndexPath) -> UICollectionViewLayoutAttributes? {
        recomputeIfNeeded()

        guard frames.indices.contains(indexPath.item) else { return nil }

        let found = attributes(at: indexPath.item)

        if let pin = pinned(), pin.index == indexPath.item { found.frame.origin.y = pin.y }

        return found
    }

    /// Sticky rows move with every scroll; otherwise only a new width lays rows out again.
    override func shouldInvalidateLayout(forBoundsChange newBounds: CGRect) -> Bool {
        !stickyIndices.isEmpty || (horizontal ? newBounds.height : newBounds.width) != geometryWidth
    }

    /// Inverted lists flip the collection view; each row flips back.
    private func attributes(at index: Int) -> UICollectionViewLayoutAttributes {
        let attributes = UICollectionViewLayoutAttributes(forCellWith: IndexPath(item: index, section: 0))

        attributes.frame = frames[index]
        // Sticky rows draw over the rows that scroll under them.
        attributes.zIndex = stickyIndices.contains(index) ? 1 : 0

        if inverted {
            attributes.transform = horizontal ? CGAffineTransform(scaleX: -1, y: 1) : CGAffineTransform(scaleX: 1, y: -1)
        }

        return attributes
    }
}
