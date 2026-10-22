import UIKit

/// Holds Kuito's root views and lays out the whole tree with the shared
/// flexbox engine whenever it is marked as needing layout. Root views stack
/// in a column that fills this view; a root ScrollView takes the full height.
/// The root lays out in the direction of the user's first language, which
/// every view without a `direction` of its own inherits.
@MainActor
final class KuitoRootView: UIView {
    // The root behaves like a Stack: a column that stretches its children.
    let node: KuitoLayoutNode
    /// Called after every layout pass.
    var laidOut: (() -> Void)?
    private var localeObserver: NSObjectProtocol?

    init() {
        guard let node = try? KuitoLayoutNode(kind: "VStack") else { preconditionFailure("Stack has layout defaults") }

        self.node = node
        super.init(frame: .zero)
        node.view = self
        followFirstLanguage()
        localeObserver = NotificationCenter.default.addObserver(
            forName: NSLocale.currentLocaleDidChangeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.followFirstLanguage() }
        }
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    deinit {
        localeObserver.map(NotificationCenter.default.removeObserver)
    }

    /// The direction localization.locales reports for the first language.
    private func followFirstLanguage() {
        let language = Locale.Language(identifier: Locale.preferredLanguages.first ?? Locale.current.identifier)
        guard (try? node.setDirection(rightToLeft: language.characterDirection == .rightToLeft)) != nil else {
            preconditionFailure("direction takes ltr and rtl")
        }

        (window ?? self).layOutEveryView()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        node.calculate(withWidth: bounds.width, height: bounds.height, scale: traitCollection.displayScale)
        node.applyFramesToChildren()
        laidOut?()
    }
}

/// A view that lays out its own subtree with the shared engine, outside its
/// parent's layout: a sheet, a navigation screen or tab. Its node has no
/// parent; the view calculates it at its own size in layoutSubviews, or a
/// list measures its row.
@MainActor
protocol KuitoLayoutRoot: KuitoStyled {
    var layout: KuitoLayoutNode? { get set }
    /// A view inside changed: lay the subtree out again. True when the screen
    /// around it lays out too.
    func subtreeChanged() -> Bool
}

extension KuitoLayoutRoot {
    /// The root of its record's layout tree.
    func style(_ style: KuitoViewStyle, in _: KuitoTreeLinks) {
        layout = style.layout
        style.layoutRoot = self
    }

    func subtreeChanged() -> Bool {
        setNeedsLayout()

        return true
    }
}

extension UIView {
    /// Marks this view and every view in it for layout: a page takes a new
    /// direction through its host's node, but lays out only when its own view
    /// does. For changes as rare as a direction's.
    func layOutEveryView() {
        setNeedsLayout()
        subviews.forEach { $0.layOutEveryView() }
    }

    /// The view laying out this view: the KuitoRootView, or a layout root.
    func rootView() -> UIView? {
        var current = superview

        while let view = current, !(view is KuitoRootView || view is KuitoLayoutRoot) { current = view.superview }

        return current
    }
}

extension KuitoLayoutNode {
    /// Far below a pixel at any scale, far above a float's rounding error.
    private static let sizeNoise: CGFloat = 0.001

    /// Positions every descendant's view from the last calculation. Bounds and
    /// center rather than frame: a view's frame is undefined while it has a
    /// transform, and Kuito animates transforms.
    @MainActor
    func applyFramesToChildren() {
        #if DEBUG
            let before = KuitoCost.total
            let started = KuitoFrameLedger.now
        #endif

        #if DEBUG
            apply(self, offset: .zero, keepingFrames: KuitoAblation.elides(.layout))
        #else
            apply(self, offset: .zero)
        #endif

        #if DEBUG
            let pass = KuitoCost.between(before, KuitoCost.total)

            KuitoCost.add(\.layoutPasses)
            if pass.wastedFrames == pass.nodesFramed { KuitoCost.add(\.wastedLayoutPasses) }
            KuitoFrameLedger.recordFrames(from: started, framed: UInt32(pass.nodesFramed), wasted: UInt32(pass.wastedFrames))
        #endif
    }

    /// A flattened child has no view: its children sit in this node's view,
    /// shifted by the flattened node's position. With layout elided
    /// (`keepingFrames`, KuitoAblation), a view that has a frame keeps it.
    @MainActor
    private func apply(_ node: KuitoLayoutNode, offset: CGPoint, keepingFrames: Bool = false) {
        for child in node.children {
            let frame = child.frame.offsetBy(dx: offset.x, dy: offset.y)

            guard let view = child.view else {
                apply(child, offset: frame.origin, keepingFrames: keepingFrames)

                continue
            }

            if keepingFrames, view.bounds.size != .zero {
                apply(child, offset: .zero, keepingFrames: keepingFrames)

                continue
            }

            #if DEBUG
                KuitoCost.add(\.nodesFramed)
                if abs(view.bounds.width - frame.width) <= Self.sizeNoise, abs(view.bounds.height - frame.height) <= Self.sizeNoise,
                   view.center == CGPoint(x: frame.midX, y: frame.midY) {
                    KuitoCost.add(\.wastedFrames)
                }
            #endif

            let move = {
                // The engine rounds to pixels in floats, so a box that only
                // moved can come back a float's noise off its old size: a
                // new size would make UIKit draw a label again.
                if abs(view.bounds.width - frame.width) > Self.sizeNoise || abs(view.bounds.height - frame.height) > Self.sizeNoise {
                    view.bounds.size = frame.size
                }
                view.center = CGPoint(x: frame.midX, y: frame.midY)
            }

            // A view's first frame applies at once; later ones may animate.
            if let animation = child.frameAnimation as? KuitoFrameAnimation,
               view.bounds.size != .zero,
               view.bounds.size != frame.size || view.center != CGPoint(x: frame.midX, y: frame.midY),
               !UIAccessibility.isReduceMotionEnabled {
                _ = animation.spec.run(move)
            } else {
                move()
            }

            (view as? KuitoPaddedView)?.padding = child.contentInset

            if let scroll = view as? KuitoScrollView {
                scroll.content.frame = CGRect(origin: .zero, size: child.contentSize)
                scroll.contentSize = child.contentSize
            }

            apply(child, offset: .zero, keepingFrames: keepingFrames)
        }
    }
}

/// A leaf that answers the engine's measure modes itself, beyond a size limit.
@MainActor
protocol KuitoModeMeasured: AnyObject {
    func size(width: CGFloat, widthMode: KuitoMeasureMode, height: CGFloat, heightMode: KuitoMeasureMode) -> CGSize
}

extension KuitoLayoutNode {
    /// Sizes a leaf the engine cannot see into (text, controls) with UIKit.
    func measure(_ view: UIView, minContent: KuitoMinContent) {
        measure = { [weak view] width, widthMode, height, heightMode in
            guard let view else { return .zero }

            // The engine measures during layout, on the main thread.
            return MainActor.assumeIsolated {
                if let measured = view as? KuitoModeMeasured {
                    return measured.size(width: width, widthMode: widthMode, height: height, heightMode: heightMode)
                }

                // Content's height follows from its width: available height is not a limit.
                let limit = CGSize(
                    width: widthMode == .minContent ? minContent.width(of: view) : widthMode == .undefined ? .greatestFiniteMagnitude : width,
                    height: heightMode == .exactly ? height : .greatestFiniteMagnitude
                )

                return view.sizeThatFits(limit)
            }
        }
    }
}
