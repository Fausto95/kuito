import UIKit

/// List and HorizontalList: FlatList's native side (docs/lists.md). A
/// UICollectionView owns scrolling; this view owns the cells JavaScript
/// renders rows into. It decides which cell shows which key, asks JavaScript
/// for a row (`bind`) when the row comes within a screen of the viewport, and
/// never waits for the answer: a row not rendered yet shows blank at its
/// last measured or estimated size.
@MainActor
final class KuitoListView: UIView, UICollectionViewDelegate, KuitoScrollable, KuitoPaddedView, KuitoModeMeasured, KuitoHost, KuitoStyled {
    let horizontal: Bool
    let layout: KuitoListLayout
    let collection: UICollectionView

    var emit: ((String, (any KuitoEventPayload)?) -> Void)? {
        didSet { motion.emit = emit }
    }
    private(set) lazy var motion = KuitoScrollMotion { [unowned self] in
        (horizontal ? collection.contentOffset.x : collection.contentOffset.y, minimumOffset...maximumOffset)
    }
    /// Lays the screen out again: the list's own size follows its rows.
    var requestLayout: (() -> Void)?

    var emitsScroll = false
    /// Turned on once something reads the visible rows: report them now, not at the next scroll.
    var emitsViewable = false {
        didSet {
            guard emitsViewable, !oldValue else { return }

            viewableRange = nil
            setNeedsLayout()
        }
    }
    var scrollEventThrottle: TimeInterval = 0.05
    var endReachedThreshold: CGFloat = 0.5
    var viewableThreshold: CGFloat = 0
    var automaticallyAdjustsKeyboardInsets = true

    var refreshable = false {
        didSet {
            guard refreshable != (collection.refreshControl != nil), !horizontal else { return }

            collection.refreshControl = refreshable ? makeRefreshControl() : nil
        }
    }

    var refreshing = false {
        didSet {
            guard let control = collection.refreshControl, refreshing != control.isRefreshing else { return }

            if refreshing { control.beginRefreshing() } else { control.endRefreshing() }
        }
    }

    var showsVerticalScrollIndicator: Bool {
        get { collection.showsVerticalScrollIndicator }
        set { collection.showsVerticalScrollIndicator = newValue }
    }

    var showsHorizontalScrollIndicator: Bool {
        get { collection.showsHorizontalScrollIndicator }
        set { collection.showsHorizontalScrollIndicator = newValue }
    }

    var scroller: UIScrollView { collection }
    var flipped: Bool { inverted && !horizontal }

    var padding: UIEdgeInsets {
        get { layout.insets }
        set {
            guard layout.insets != newValue else { return }

            layout.insets = newValue
            invalidateRows()
        }
    }

    var rowGap: CGFloat {
        get { layout.rowGap }
        set {
            guard layout.rowGap != newValue else { return }

            layout.rowGap = newValue
            invalidateRows()
        }
    }

    var columnGap: CGFloat {
        get { layout.columnGap }
        set {
            guard layout.columnGap != newValue else { return }

            layout.columnGap = newValue
            invalidateRows()
        }
    }

    var inverted = false {
        didSet {
            layout.inverted = inverted
            setNeedsLayout()
        }
    }

    var initialScrollKey: String? {
        didSet { if initialScrollKey != oldValue { initialScrollDone = false } }
    }

    private let id: String
    private var dataSource: UICollectionViewDiffableDataSource<Int, String>?
    private var loaded = false
    private let cells: KuitoListCells
    private var lastOffset: CGFloat = 0
    private var lastScrollEvent: TimeInterval = 0
    /// The row count end-reached last fired for: new rows re-arm it.
    private var endReachedCount = -1
    private var viewableRange: (String, String)?
    private var initialScrollDone = false
    /// A requested scroll position kept while rows around it are measured.
    private var scrollTarget: (key: String, position: CGFloat, offset: CGFloat)?
    private var scrollAnimating = false
    /// The height last reported to the layout engine.
    private var reportedHeight: CGFloat = -1

    init(id: String, horizontal: Bool) {
        self.id = id
        self.horizontal = horizontal
        layout = KuitoListLayout(horizontal: horizontal)
        collection = UICollectionView(frame: .zero, collectionViewLayout: layout)
        cells = KuitoListCells(listID: id)
        super.init(frame: .zero)

        cells.onBind = { [weak self] cell, key in self?.emit?("bind", KuitoBindCellsPayload(cell: cell, key: key)) }

        collection.backgroundColor = .clear
        collection.delegate = self
        // Rows are rendered ahead by this view, not by UIKit's prefetching.
        collection.isPrefetchingEnabled = false
        collection.contentInsetAdjustmentBehavior = .never
        collection.alwaysBounceVertical = !horizontal
        collection.alwaysBounceHorizontal = horizontal
        collection.register(KuitoListShell.self, forCellWithReuseIdentifier: KuitoListShell.reuseIdentifier)
        dataSource = UICollectionViewDiffableDataSource(collectionView: collection) { [weak self] collection, indexPath, key in
            let shell = collection.dequeueReusableCell(withReuseIdentifier: KuitoListShell.reuseIdentifier, for: indexPath)

            if let shell = shell as? KuitoListShell, let self { shell.host(self.cells.slot(for: key)) }

            return shell
        }
        addSubview(collection)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    // MARK: - Data

    /// Applies a key diff whole, or throws and keeps the keys (docs/lists.md#keys).
    func edit(keys edits: [KuitoKeyEdit]) throws {
        try setKeys(edits.applied(to: layout.keys))
    }

    /// `keys` are unique: a diff applied, or none.
    func setKeys(_ keys: [String]) {
        var snapshot = NSDiffableDataSourceSnapshot<Int, String>()

        snapshot.appendSections([0])
        snapshot.appendItems(keys)
        layout.keys = keys

        // The first rows load without diffing; later changes animate as inserts, removals and moves.
        if loaded {
            dataSource?.apply(snapshot, animatingDifferences: window != nil)
        } else {
            dataSource?.applySnapshotUsingReloadData(snapshot)
            loaded = true
        }

        // The list's measured length follows its rows.
        requestLayout?()
        setNeedsLayout()
    }

    /// A scroll request: `{ key, animated, align, margin }`,
    /// `{ offset, animated }` or `{ end, animated }`.
    func scroll(to request: KuitoScrollRequestValue) throws {
        switch request {
        case .key(let request):
            scrollTarget = (request.key, CGFloat(request.align ?? 0), CGFloat(request.margin ?? 0))
            scrollToTarget(animated: request.animated ?? true)
        case .end(let request):
            scrollTarget = nil
            setOffset(request.end ? maximumOffset : 0, animated: request.animated ?? true)
        case .offset(let request):
            scrollTarget = nil
            setOffset(CGFloat(request.offset), animated: request.animated ?? true)
        case .page:
            throw KuitoRenderError.Rejection("a list scrolls to a key, an offset or its end; pages are a ScrollView's")
        }
    }

    /// No request: a target rows were still settling toward is dropped.
    func cancelScroll() {
        scrollTarget = nil
    }

    /// Every row lays out again, e.g. when the columns' width changed.
    func invalidateRows() {
        for slot in cells.all { slot.dirty = true }

        setNeedsLayout()
    }

    // MARK: - Cells

    /// JavaScript created the cell this list named (or, after a reconnect,
    /// one this list has not seen: it joins the pool with the key it shows).
    func style(_ style: KuitoViewStyle, in tree: KuitoTreeLinks) {
        requestLayout = { [weak style] in
            style?.layout.markDirty()
            tree.setNeedsLayout()
        }
    }

    /// A row joins the pool under the id the list asked the kernel for.
    func adopt(_ child: UIView, label id: String, at _: Int?) throws {
        guard let cell = child as? KuitoListCell else { throw KuitoRenderError.invalidTree("only a ListCell goes in a list") }

        let slot = cells.adopt(cell, id: id)

        slot.dirty = true
        cell.list = self
        cell.isHidden = true
        slot.shell?.show()
        setNeedsLayout()
    }

    /// Rows are placed by their keys, not by their place among the children.
    func move(_: UIView, to _: Int) throws {}

    func release(_ child: UIView, gone: @escaping () -> Void) throws {
        if let cell = child as? KuitoListCell { cells.remove(cell)?.shell?.release() }

        child.removeFromSuperview()
        gone()
    }

    func animatesRemoval(_: UIView) -> Bool {
        false
    }

    func cellChanged(_ cell: KuitoListCell) {
        guard let slot = cells.slot(of: cell) else { return }

        cells.join(slot, key: cell.renderedKey)

        slot.dirty = true
        setNeedsLayout()
    }

    // MARK: - Layout

    override func layoutSubviews() {
        super.layoutSubviews()

        // Inverted lists flip the collection view; the layout flips each row back.
        let flip: CGAffineTransform = !inverted ? .identity
            : horizontal ? CGAffineTransform(scaleX: -1, y: 1) : CGAffineTransform(scaleX: 1, y: -1)

        if collection.transform != flip { collection.transform = flip }

        if collection.bounds.size != bounds.size {
            let crossChanged = horizontal ? collection.bounds.height != bounds.height : collection.bounds.width != bounds.width

            collection.bounds.size = bounds.size

            if crossChanged { invalidateRows() }
        }

        collection.center = CGPoint(x: bounds.midX, y: bounds.midY)
        measureRows()
        applyInitialScroll()
        correctScrollTarget()
        updateWindow()
        checkEndReached()
        reportViewable()
    }

    /// The engine sizes a list from its rows: along the axis, their total
    /// length; across a horizontal list, the tallest row. Its min-content
    /// length is zero, unlike a CSS scroll container's content: rows scroll
    /// into view, so a list never forces a flexible column taller.
    func size(width: CGFloat, widthMode: KuitoMeasureMode, height: CGFloat, heightMode: KuitoMeasureMode) -> CGSize {
        var fitted = intrinsicSize(width: widthMode == .exactly || widthMode == .atMost ? width : .nan)

        if horizontal, widthMode == .minContent { fitted.width = 0 }

        if !horizontal, heightMode == .minContent { fitted.height = 0 } else { reportedHeight = fitted.height }

        return fitted
    }

    private func intrinsicSize(width: CGFloat) -> CGSize {
        let length = layout.totalLength

        return horizontal
            ? CGSize(width: length, height: layout.crossExtent)
            : CGSize(width: width.isFinite ? width : layout.crossExtent, height: length)
    }

    /// Measures rows whose content changed, keeping the first visible row
    /// where it is when rows above it change size.
    private func measureRows() {
        let anchor = firstVisibleIndex().flatMap { index in layout.frame(at: index).map { (index, $0) } }
        var resized = false

        for slot in cells.all where slot.dirty {
            guard let view = slot.view, let key = slot.key else { continue }

            slot.dirty = false

            // Content for another key is never measured as this one's.
            guard view.renderedKey == key else {
                slot.ready = false
                slot.shell?.show()

                continue
            }

            let size = view.measure(width: layout.crossLength(for: key))

            if layout.setSize(size, of: key) { resized = true }

            slot.ready = true
            slot.shell?.show()
        }

        guard resized else { return }

        if let (index, before) = anchor, let after = layout.frame(at: index), scrollTarget == nil {
            let delta = horizontal ? after.minX - before.minX : after.minY - before.minY

            if delta != 0 {
                var offset = collection.contentOffset

                if horizontal { offset.x += delta } else { offset.y += delta }

                collection.contentOffset = offset
            }
        }

        collection.layoutIfNeeded()
        reportIntrinsicSize()
    }

    /// The screen lays out again when this list's height is the one it
    /// reported (it is sized by its rows) and its rows now need another.
    private func reportIntrinsicSize() {
        let height = intrinsicSize(width: bounds.width).height

        if abs(bounds.height - reportedHeight) < 0.5, abs(height - reportedHeight) >= 0.5 { requestLayout?() }
    }

    private func firstVisibleIndex() -> Int? {
        layout.indices(in: collection.bounds).first { index in
            guard let frame = layout.frame(at: index) else { return false }

            return horizontal ? frame.maxX > collection.bounds.minX : frame.maxY > collection.bounds.minY
        }
    }

    // MARK: - Rendering ahead

    /// Rows within a screen ahead of the viewport (half a screen behind) get
    /// a cell and are rendered before they scroll in.
    private func updateWindow() {
        // Only the axis counts: a horizontal list is as tall as its rows, so it
        // has no height until the first rows it binds are measured.
        guard !layout.keys.isEmpty, mainLength > 0 else { return }

        let visible = collection.bounds
        let offset = horizontal ? visible.minX : visible.minY
        let length = horizontal ? visible.width : visible.height
        let forward = offset >= lastOffset
        let before = forward ? length / 2 : length
        let after = forward ? length : length / 2

        lastOffset = offset

        let rect = horizontal
            ? CGRect(x: visible.minX - before, y: visible.minY, width: visible.width + before + after, height: visible.height)
            : CGRect(x: visible.minX, y: visible.minY - before, width: visible.width, height: visible.height + before + after)
        // The pinned sticky row shows however far its own place has scrolled.
        let indices = Array(layout.indices(in: rect)) + (layout.pinned().map { [$0.index] } ?? [])

        cells.setWindow(indices.map { layout.keys[$0] })

        for index in indices { _ = cells.slot(for: layout.keys[index]) }
    }

    // MARK: - Scrolling

    private var mainOffset: CGFloat { horizontal ? collection.contentOffset.x : collection.contentOffset.y }
    private var mainLength: CGFloat { horizontal ? collection.bounds.width : collection.bounds.height }
    /// The scroll range reaches into the content insets the keyboard adds.
    private var minimumOffset: CGFloat { -(horizontal ? collection.contentInset.left : collection.contentInset.top) }
    private var maximumOffset: CGFloat {
        max(layout.totalLength + (horizontal ? collection.contentInset.right : collection.contentInset.bottom) - mainLength, 0)
    }

    private func setOffset(_ value: CGFloat, animated: Bool) {
        let clamped = min(max(value, minimumOffset), maximumOffset)
        let point = horizontal ? CGPoint(x: clamped, y: collection.contentOffset.y) : CGPoint(x: collection.contentOffset.x, y: clamped)

        guard point != collection.contentOffset else { return }

        // A far animated jump would fly past rows nobody has rendered: cut to
        // a screen before the target and animate the rest.
        let distance = clamped - mainOffset

        if animated, abs(distance) > 3 * mainLength {
            let near = clamped - (distance > 0 ? mainLength : -mainLength)

            collection.contentOffset = horizontal ? CGPoint(x: near, y: point.y) : CGPoint(x: point.x, y: near)
            layoutIfNeeded()
        }

        scrollAnimating = animated
        collection.setContentOffset(point, animated: animated)
    }

    /// Where the target row lands: `position` 0 puts it at the start, 1 at the end.
    private func targetOffset() -> CGFloat? {
        guard let target = scrollTarget, let index = layout.indexOfKey[target.key], let frame = layout.frame(at: index) else { return nil }

        let start = horizontal ? frame.minX : frame.minY
        let size = horizontal ? frame.width : frame.height

        return start - target.offset - target.position * (mainLength - size)
    }

    private func scrollToTarget(animated: Bool) {
        guard let offset = targetOffset() else { return }

        setOffset(offset, animated: animated)
    }

    /// Rows measured on the way change where the target is: land on it
    /// again, until every visible row has its real size.
    private func correctScrollTarget() {
        guard scrollTarget != nil, !scrollAnimating, !collection.isTracking else { return }

        scrollToTarget(animated: false)

        let settled = layout.indices(in: collection.bounds).allSatisfy { layout.size(of: layout.keys[$0]) != nil }

        if settled { scrollTarget = nil }
    }

    private func applyInitialScroll() {
        guard !initialScrollDone, let key = initialScrollKey, layout.indexOfKey[key] != nil, mainLength > 0 else { return }

        initialScrollDone = true
        scrollTarget = (key, 0, 0)
        scrollToTarget(animated: false)
    }

    private func checkEndReached() {
        let count = layout.keys.count

        guard count > 0, count != endReachedCount, mainLength > 0,
              layout.totalLength - (mainOffset + mainLength) <= endReachedThreshold * mainLength else { return }

        endReachedCount = count
        emit?("reachend", nil)
    }

    /// The first and last rows visible by at least `viewableThreshold` of their length.
    private func reportViewable() {
        guard emitsViewable else { return }

        let visible = collection.bounds
        let viewable = layout.indices(in: visible).filter { index in
            guard let frame = layout.frame(at: index) else { return false }

            let shown = frame.intersection(visible)
            let length = horizontal ? frame.width : frame.height
            let seen = horizontal ? shown.width : shown.height

            return !shown.isNull && seen > 0 && (length == 0 || seen / length >= viewableThreshold)
        }
        let range = viewable.first.map { (layout.keys[$0], layout.keys[viewable.last ?? $0]) }

        guard range?.0 != viewableRange?.0 || range?.1 != viewableRange?.1 else { return }

        viewableRange = range
        emit?("viewable", KuitoViewableKeysPayload(first: range?.0 ?? "", last: range?.1 ?? ""))
    }

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        updateWindow()
        checkEndReached()
        reportViewable()
        motion.scrolled()

        guard emitsScroll else { return }

        let now = CACurrentMediaTime()

        guard now - lastScrollEvent >= scrollEventThrottle else { return }

        lastScrollEvent = now
        emit?("scroll", KuitoScrollPayload(
            x: Double(collection.contentOffset.x), y: Double(collection.contentOffset.y),
            contentWidth: Double(collection.contentSize.width), contentHeight: Double(collection.contentSize.height),
            layoutWidth: Double(collection.bounds.width), layoutHeight: Double(collection.bounds.height)
        ))
    }

    func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
        scrollTarget = nil
        scrollAnimating = false
    }

    func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {
        scrollAnimating = false
        correctScrollTarget()
    }

    func collectionView(_ collectionView: UICollectionView, didEndDisplaying cell: UICollectionViewCell, forItemAt indexPath: IndexPath) {
        (cell as? KuitoListShell)?.release()
    }

    private func makeRefreshControl() -> UIRefreshControl {
        let control = UIRefreshControl()

        control.addAction(UIAction { [weak self] _ in self?.emit?("refresh", nil) }, for: .valueChanged)

        return control
    }
}
