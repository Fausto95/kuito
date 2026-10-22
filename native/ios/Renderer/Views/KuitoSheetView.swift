import UIKit

/// A sheet height: points, a fraction of the available height, or the
/// content's own height.
enum KuitoSnapPoint: Equatable {
    case points(CGFloat)
    case fraction(CGFloat)
    case content

    init?(_ value: KuitoSnapPointValue) {
        switch value {
        case .height(let points):
            self = .points(CGFloat(points))
        case .named("content"):
            self = .content
        case .named(let text):
            guard text.hasSuffix("%"), let percent = Double(text.dropLast()) else { return nil }

            self = .fraction(CGFloat(percent) / 100)
        }
    }
}

/// How a Sheet is presented: UIKit's sheet at its snap points, a page sheet
/// at full height (a modal route), or a cover of the whole screen.
enum KuitoSheetPresentation: String {
    case sheet
    case modal
    case fullScreen

    var style: UIModalPresentationStyle {
        self == .fullScreen ? .fullScreen : .pageSheet
    }
}

/// BottomSheet: its children's root, presented in a UISheetPresentationController
/// while `open`. The view is the sheet's content, so style props (background,
/// padding) apply inside the sheet. It lays out its own subtree with the shared
/// engine, at the sheet's width. A modal or full-screen presentation holds a
/// NavigationStack, which keeps its own content clear of the bars.
@MainActor
final class KuitoSheetView: UIView, KuitoLayoutRoot {
    /// The sheet's node: a layout root of its own, outside the screen's tree.
    weak var layout: KuitoLayoutNode?
    var emit: ((String, (any KuitoEventPayload)?) -> Void)? {
        didSet { motion.emit = emit }
    }
    /// Where the sheet stands as it moves (docs/motion.md#motion-sources).
    private(set) lazy var motion: KuitoSheetMotion = {
        let motion = KuitoSheetMotion()

        motion.measure = { [weak self] in self?.position() }

        return motion
    }()
    /// The tallest a snap point can be, as UIKit last resolved the detents.
    private var maximumHeight: CGFloat = 0
    /// The view controller to present from.
    var presenter: (() -> UIViewController?)?
    private var styleOf: ((KuitoLayoutNode) -> KuitoViewStyle?)?
    /// The view the sheet's inset pads, when not the sheet itself.
    private weak var padded: KuitoViewStyle?

    func style(_ style: KuitoViewStyle, in tree: KuitoTreeLinks) {
        layout = style.layout
        style.layoutRoot = self
        style.sheet = self
        presenter = tree.presenter
        styleOf = tree.style
    }

    var open = false {
        didSet { if open != oldValue { DispatchQueue.main.async { self.syncPresentation() } } }
    }

    var snapPoints: [KuitoSnapPoint] = [.content] {
        didSet { if snapPoints != oldValue { configure() } }
    }

    var grabber = true {
        didSet { configure() }
    }

    var dismissible = true {
        didSet { controller?.isModalInPresentation = !dismissible }
    }

    var cornerRadius: CGFloat? {
        didSet { configure() }
    }

    /// Read when the sheet presents: a change shows at the next present.
    var presentation = KuitoSheetPresentation.sheet

    private var controller: KuitoSheetController?
    private var contentHeight: CGFloat = 0

    override func layoutSubviews() {
        super.layoutSubviews()

        guard let layout, bounds.width > 0 else { return }

        // Keep content clear of the home indicator and, in landscape, the
        // screen's sides. Floating sheets report less than they overlap, so
        // measure the overlap with the window's safe area directly. A modal's
        // stack fills it and insets its screens itself.
        pad(presentation == .sheet
            ? UIEdgeInsets(top: 0, left: safeAreaInsets.left, bottom: bottomOverlap(), right: safeAreaInsets.right)
            : .zero)
        layout.calculate(withWidth: bounds.width, height: bounds.height, scale: traitCollection.displayScale)
        layout.applyFramesToChildren()
        updateContentHeight(width: bounds.width)
    }

    /// Gives the inset to the sheet's only view, as UIKit gives a controller's
    /// view its safe area: that view's background (a sheet route's screen)
    /// runs to the sheet's edges, under the home indicator, while its content
    /// stays clear. Several views share the sheet's own inset; a SafeArea
    /// pads itself, so it gets none.
    private func pad(_ inset: UIEdgeInsets) {
        guard let layout else { return }

        let children = layout.children
        let only = children.count == 1 && !(children[0].view is KuitoSafeAreaView) ? children[0] : nil
        let content = only.flatMap { node in padded?.layout === node ? padded : styleOf?(node) }

        if let padded, padded !== content, children.contains(where: { $0 === padded.layout }) {
            padded.safeAreaInset = .zero
            padded.applyInset()
        }

        padded = content
        layout.inset = content == nil ? inset : .zero
        content?.safeAreaInset = inset
        content?.applyInset()
    }

    /// How far the window's bottom safe area reaches into this view.
    private func bottomOverlap() -> CGFloat {
        guard let window else { return safeAreaInsets.bottom }

        let frame = convert(bounds, to: window)
        let safeBottom = window.bounds.height - window.safeAreaInsets.bottom

        return max(frame.maxY - safeBottom, safeAreaInsets.bottom, 0)
    }

    /// Dismisses without reporting `close`: the app removed or closed the sheet.
    func dismissFromApp() {
        open = false
        syncPresentation()
    }

    /// Brings UIKit to `open`, one transition at a time: UIKit drops a present
    /// or dismiss sent while another runs, which leaves a removed sheet up and
    /// every later one hidden. A sheet waiting here is kept alive by its
    /// controller, which holds it as its view.
    private func syncPresentation() {
        if let busy = transitioning() {
            let retry = { DispatchQueue.main.async { [weak self] in self?.syncPresentation() } }
            let queued = busy.transitionCoordinator?.animate(alongsideTransition: nil) { _ in retry() } ?? false

            if !queued { retry() }
        } else if open, controller == nil {
            present()
        } else if !open, let controller {
            self.controller = nil
            controller.dismiss(animated: true)
        }
    }

    /// The controller over the presenter still animating in or out, if any.
    private func transitioning() -> UIViewController? {
        var next = presenter?()

        while let host = next {
            if host.isBeingPresented || host.isBeingDismissed { return host }

            next = host.presentedViewController
        }

        return nil
    }

    private func present() {
        guard var host = presenter?() else { return }

        while let presented = host.presentedViewController { host = presented }

        // Size the content before the first detent resolves: a zero-height
        // detent would read as dismissed.
        updateContentHeight(width: host.view.bounds.width)

        let controller = KuitoSheetController(content: self, style: presentation.style)

        controller.onDismiss = { [weak self] in
            self?.controller = nil
            self?.open = false
            self?.emit?("close", nil)
        }
        controller.onSnap = { [weak self] index in
            self?.motion.wake()
            self?.emit?("snap", KuitoIndexPayload(index: Double(index)))
        }
        controller.isModalInPresentation = !dismissible
        self.controller = controller
        configure()
        host.present(controller, animated: true)
        controller.presentationController?.presentedView?.addGestureRecognizer(KuitoSheetTouches(motion))
        motion.wake()
    }

    /// The presented view's height over the screen's bottom as it moves, and its snap points' span.
    private func position() -> (height: CGFloat, lowest: CGFloat, highest: CGFloat)? {
        guard let presented = controller?.presentationController?.presentedView,
              let container = presented.superview else { return nil }

        let height = container.bounds.height - (presented.layer.presentation() ?? presented.layer).frame.minY
        // Detents leave out the bottom safe area the presented view covers.
        let inset = container.safeAreaInsets.bottom
        let heights = presentation == .sheet && maximumHeight > 0
            ? snapPoints.map { self.height(of: $0, maximum: maximumHeight) + inset }
            : [container.bounds.height]

        return (max(height, 0), heights.min() ?? 0, heights.max() ?? 0)
    }

    private func configure() {
        guard presentation == .sheet else { return configureModal() }

        guard let sheet = controller?.sheetPresentationController else { return }

        sheet.detents = snapPoints.enumerated().map { index, point in
            .custom(identifier: .init("snap-\(index)")) { [weak self] context in
                self?.maximumHeight = context.maximumDetentValue

                return self?.height(of: point, maximum: context.maximumDetentValue) ?? context.maximumDetentValue
            }
        }
        sheet.prefersGrabberVisible = grabber
        sheet.preferredCornerRadius = cornerRadius
        sheet.prefersScrollingExpandsWhenScrolledToEdge = true
    }

    /// UIKit's own page sheet: full height, no grabber, the system's corners.
    private func configureModal() {
        guard let sheet = controller?.sheetPresentationController else { return }

        sheet.detents = [.large()]
        sheet.prefersGrabberVisible = false
    }

    private func height(of point: KuitoSnapPoint, maximum: CGFloat) -> CGFloat {
        switch point {
        case .points(let value): min(value, maximum)
        case .fraction(let value): maximum * min(max(value, 0), 1)
        case .content: min(max(contentHeight, 1), maximum)
        }
    }

    /// The content's height at this width, without the bottom inset (detents exclude it).
    private func updateContentHeight(width: CGFloat) {
        guard let layout, presentation == .sheet, snapPoints.contains(.content) else { return }

        let padding = padded?.layout ?? layout
        let inset = padding.inset

        padding.inset = .zero
        layout.calculate(withWidth: width, height: .nan, scale: traitCollection.displayScale)

        // Detents exclude the bottom safe area UIKit reports; add what the
        // home indicator overlaps beyond it.
        let height = layout.frame.height + max(bottomOverlap() - safeAreaInsets.bottom, 0)

        padding.inset = inset

        if bounds.width > 0 {
            layout.calculate(withWidth: bounds.width, height: bounds.height, scale: traitCollection.displayScale)
            layout.applyFramesToChildren()
        }

        guard abs(height - contentHeight) > 0.5 else { return }

        contentHeight = height
        controller?.sheetPresentationController?.animateChanges {
            controller?.sheetPresentationController?.invalidateDetents()
        }
    }
}

/// Hosts the sheet's content view and reports dismissal and snap changes.
@MainActor
final class KuitoSheetController: UIViewController, UISheetPresentationControllerDelegate {
    var onDismiss: (() -> Void)?
    var onSnap: ((Int) -> Void)?
    private let content: KuitoSheetView

    init(content: KuitoSheetView, style: UIModalPresentationStyle) {
        self.content = content
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = style
        // Swiping a page sheet away reports here; a full-screen cover has no
        // sheet controller, and only the app closes it.
        presentationController?.delegate = self
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func loadView() {
        view = content
    }

    // UIKit asks a full-screen cover for the status bar: answer with the
    // controller below, where the app's SystemBars are applied.
    override var preferredStatusBarStyle: UIStatusBarStyle {
        presentingViewController?.preferredStatusBarStyle ?? super.preferredStatusBarStyle
    }

    override var prefersStatusBarHidden: Bool {
        presentingViewController?.prefersStatusBarHidden ?? super.prefersStatusBarHidden
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        onDismiss?()
    }

    func sheetPresentationControllerDidChangeSelectedDetentIdentifier(_ sheet: UISheetPresentationController) {
        guard let identifier = sheet.selectedDetentIdentifier?.rawValue,
              let index = Int(identifier.replacingOccurrences(of: "snap-", with: "")) else { return }

        onSnap?(index)
    }
}
