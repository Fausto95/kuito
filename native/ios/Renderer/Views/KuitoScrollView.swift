import UIKit

/// ScrollView and HorizontalScrollView: a scroll view holding its children in
/// a content view sized by the layout engine, reporting scroll, where it
/// rests, end-reached and pull-to-refresh. Scroll events are sent only while
/// JavaScript listens.
@MainActor
final class KuitoScrollView: UIScrollView, UIScrollViewDelegate {
    let content = UIView()
    let horizontal: Bool

    var emit: ((String, (any KuitoEventPayload)?) -> Void)? {
        didSet { motion.emit = emit }
    }
    var emitsScroll = false
    private(set) lazy var motion = KuitoScrollMotion { [unowned self] in
        (mainOffset, minimumOffset...maximumOffset)
    }
    var scrollEventThrottle: TimeInterval = 0.05
    var endReachedThreshold: CGFloat = 0.5
    /// Insets the content by the part the keyboard covers (see KuitoKeyboard).
    var automaticallyAdjustsKeyboardInsets = true

    /// Where a drag may come to rest, in points along the axis; unused while paging.
    var snapOffsets: [CGFloat] = [] {
        didSet { decelerationRate = snapOffsets.isEmpty ? .normal : .fast }
    }

    var refreshable = false {
        didSet {
            guard refreshable != (refreshControl != nil), !horizontal else { return }

            refreshControl = refreshable ? makeRefreshControl() : nil
        }
    }

    var refreshing = false {
        didSet {
            guard let control = refreshControl, refreshing != control.isRefreshing else { return }

            if refreshing { control.beginRefreshing() } else { control.endRefreshing() }
        }
    }

    private var lastScrollEvent: TimeInterval = 0
    /// The content length end-reached last fired for; growing content re-arms it.
    private var endReachedLength: CGFloat = -1
    /// A scroll request waiting for the layout to size the content its batch brought.
    private var pendingScroll: (target: Target, animated: Bool)?

    private enum Target {
        case offset(CGFloat)
        case end
        /// A whole view length each, as paging rests.
        case page(Int)
    }

    init(horizontal: Bool) {
        self.horizontal = horizontal
        super.init(frame: .zero)
        delegate = self
        // As in React Native, SafeAreaView decides insets, not the scroll view.
        contentInsetAdjustmentBehavior = .never
        addSubview(content)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    /// Content shorter than the screen counts as reaching the end, as in React Native.
    override func layoutSubviews() {
        super.layoutSubviews()
        applyPendingScroll()
        checkEndReached()
    }

    /// A request, `{ offset, animated }`, `{ end, animated }` or `{ page,
    /// animated }`, lands in the next layout pass: the root lays the content
    /// out first, so the end includes what the same batch added.
    func scroll(to request: KuitoScrollRequestValue) throws {
        switch request {
        case .offset(let request):
            pendingScroll = (.offset(CGFloat(request.offset)), request.animated ?? true)
        case .end(let request):
            pendingScroll = (request.end ? .end : .offset(0), request.animated ?? true)
        case .page(let request):
            pendingScroll = (.page(request.page), request.animated ?? true)
        case .key:
            throw KuitoRenderError.Rejection("a ScrollView scrolls to an offset or its end; a key is a List's")
        }

        setNeedsLayout()
    }

    func cancelScroll() {
        pendingScroll = nil
    }

    private func applyPendingScroll() {
        guard let request = pendingScroll else { return }

        pendingScroll = nil

        let offset: CGFloat

        switch request.target {
        case .offset(let points): offset = points
        case .end: offset = maximumOffset
        case .page(let page): offset = CGFloat(page) * (horizontal ? bounds.width : bounds.height)
        }

        let clamped = min(max(offset, minimumOffset), maximumOffset)
        let point = horizontal ? CGPoint(x: clamped, y: contentOffset.y) : CGPoint(x: contentOffset.x, y: clamped)

        setContentOffset(point, animated: request.animated)

        // An animated one rests in scrollViewDidEndScrollingAnimation.
        if !request.animated { rested() }
    }

    private var mainOffset: CGFloat { horizontal ? contentOffset.x : contentOffset.y }
    /// The scroll range reaches into the content insets the keyboard adds.
    private var minimumOffset: CGFloat { -(horizontal ? contentInset.left : contentInset.top) }
    private var maximumOffset: CGFloat {
        horizontal
            ? max(contentSize.width + contentInset.right - bounds.width, 0)
            : max(contentSize.height + contentInset.bottom - bounds.height, 0)
    }

    func scrollViewWillEndDragging(
        _ scrollView: UIScrollView, withVelocity velocity: CGPoint, targetContentOffset: UnsafeMutablePointer<CGPoint>
    ) {
        guard !isPagingEnabled, !snapOffsets.isEmpty else { return }

        let target = targetContentOffset.pointee
        let rest = KuitoScrollSnap.restingOffset(
            points: snapOffsets, current: mainOffset, projected: horizontal ? target.x : target.y,
            velocity: horizontal ? velocity.x : velocity.y, maximum: maximumOffset
        )

        targetContentOffset.pointee = horizontal ? CGPoint(x: rest, y: target.y) : CGPoint(x: target.x, y: rest)
    }

    func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
        if !decelerate { rested() }
    }

    func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
        rested()
    }

    func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {
        rested()
    }

    /// Where it came to rest, HTML's `scrollend`: sent whether or not the app
    /// listens, as it comes once per rest.
    private func rested() {
        emit?("scrollend", KuitoScrollPayload(
            x: Double(contentOffset.x), y: Double(contentOffset.y),
            contentWidth: Double(contentSize.width), contentHeight: Double(contentSize.height),
            layoutWidth: Double(bounds.width), layoutHeight: Double(bounds.height)
        ))
    }

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        checkEndReached()
        motion.scrolled()

        guard emitsScroll else { return }

        let now = CACurrentMediaTime()

        guard now - lastScrollEvent >= scrollEventThrottle else { return }

        lastScrollEvent = now
        emit?("scroll", KuitoScrollPayload(
            x: Double(contentOffset.x), y: Double(contentOffset.y),
            contentWidth: Double(contentSize.width), contentHeight: Double(contentSize.height),
            layoutWidth: Double(bounds.width), layoutHeight: Double(bounds.height)
        ))
    }

    private func checkEndReached() {
        let visible = horizontal ? bounds.width : bounds.height
        let length = horizontal ? contentSize.width : contentSize.height
        let offset = horizontal ? contentOffset.x : contentOffset.y

        guard visible > 0, length > 0, length != endReachedLength,
              length - (offset + visible) <= endReachedThreshold * visible else { return }

        endReachedLength = length
        emit?("reachend", nil)
    }

    private func makeRefreshControl() -> UIRefreshControl {
        let control = UIRefreshControl()

        control.addAction(UIAction { [weak self] _ in self?.emit?("refresh", nil) }, for: .valueChanged)

        return control
    }
}
