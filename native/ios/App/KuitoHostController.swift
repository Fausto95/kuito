import UIKit

/// Native UIKit shell: Hermes on the device, its views in `renderer`. Each
/// configuration's `KuitoViewController` adds what it shows around the
/// app: Debug's the dev link, devtools and LogBox (App/Debug), Release's
/// none of them (App/Release).
@MainActor
class KuitoHostController: UIViewController {
    let surface = UIView()
    private(set) var renderer: KuitoUIKitRenderer!
    private(set) var engine: KuitoHermesBridge?
    /// Whether the app has drawn since it started.
    private(set) var hasFirstFrame = false

    /// The inspector the runtimes attach to (docs/devtools.md); none in Release.
    var inspector: KuitoInspector? { nil }

    /// The view's color when the app sets none.
    var blankBackground: UIColor { .systemBackground }

    init() {
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    /// Draws what the configuration shows over the app, before the splash covers it.
    func install() {}

    /// A view the app updated.
    func rendered(_ view: UIView) {}

    /// The app's first frame, before the splash hands over to it.
    func firstFrame() {}

    /// console output: every entry prints in the system log.
    func log(_ level: String, _ message: String, stack: String) {
        NSLog("[%@] %@", level, message)
    }

    /// What a failure logs: its cause, if any, over what failed.
    func describe(_ what: String, _ error: Error?) -> (message: String, stack: String) {
        let stack = (error as NSError?)?.userInfo[KuitoStackKey] as? String ?? ""

        return (error.map { "\($0.localizedDescription)\n\(what)" } ?? what, stack)
    }

    /// A failure of `what`; a JavaScript error brings its own message and stack.
    func failed(_ what: String, _ error: Error? = nil, fatal: Bool = false) {
        let (message, stack) = describe(what, error)

        NSLog("[%@] %@\n%@", fatal ? "fatal" : "error", message, stack)

        // Code that failed to run leaves nothing to hand off to.
        if fatal { KuitoSplash.shared.dismiss() }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = KuitoAppSettings.backgroundColor ?? blankBackground
        bars.launched(statusBarStyle: KuitoAppSettings.statusBarStyle, hidden: KuitoAppSettings.statusBarHidden)
        bars.onChange = { [weak self] animated in self?.applySystemBars(animated: animated) }
        // Edge to edge, as in React Native: SafeAreaView opts content back in.
        fill(view, with: surface)
        renderer = KuitoUIKitRenderer(container: surface)
        renderer.onUpdate = { [weak self] view in self?.updated(view) }
        install()
        // Over everything, so the launch screen hands over to the same view (docs/splash.md).
        KuitoSplash.shared.install(in: view) { [weak self] in self?.engine?.hasPendingBatches == true }

        renderer.onEvent = { [weak self] id, event, record in
            // A UI-thread handler runs here, before the frame; others go to JS.
            if self?.engine?.handleUIEvent(handle: id, event: event, record: record) == true { return true }

            self?.engine?.dispatchEvent(handle: id, event: event, record: record) { error in
                if let error { self?.failed("Event \(event) of view \(id) failed", error) }
            }

            return false
        }
        startEngine(source: nil)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        KuitoSplash.shared.measure()
    }

    // MARK: - System chrome, as SystemBars sets it

    private let bars = KuitoSystemBars.shared

    override var preferredStatusBarStyle: UIStatusBarStyle { bars.statusBarStyle }
    override var prefersStatusBarHidden: Bool { bars.statusBarHidden }
    override var preferredStatusBarUpdateAnimation: UIStatusBarAnimation { bars.statusBarAnimation }
    override var prefersHomeIndicatorAutoHidden: Bool { bars.homeIndicatorAutoHidden }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { bars.deferredEdges }

    private func applySystemBars(animated: Bool) {
        if animated {
            UIView.animate(withDuration: 0.3) { self.setNeedsStatusBarAppearanceUpdate() }
        } else {
            setNeedsStatusBarAppearanceUpdate()
        }

        setNeedsUpdateOfHomeIndicatorAutoHidden()
        setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
        view.backgroundColor = bars.backgroundColor.map(UIColor.init(cssHex:))
            ?? KuitoAppSettings.backgroundColor ?? blankBackground
    }

    private func updated(_ view: UIView) {
        rendered(view)

        guard !hasFirstFrame else { return }

        hasFirstFrame = true
        firstFrame()
        KuitoSplash.shared.firstFrame()
    }

    // MARK: - Engine

    /// Hermes on the device: the kernel, then the app (bundled, or `source` in its place).
    func startEngine(source: String?) {
        do {
            let bundle = try KuitoAppBundle.load()
            let bridge = try KuitoHermesBridge(link: KuitoLinker(KuitoLink.function, KuitoLink.observer), inspector: inspector,
                                                modules: bundle.modules)

            bridge.delegate = self
            engine = bridge
            let application = source.map { Data($0.utf8) } ?? bundle.app

            bridge.evaluateScript(bundle.bootstrap, sourceURL: "kuito://bootstrap") { [weak self] error in
                if let error { return self?.failed("The Kuito kernel failed to start", error, fatal: true) ?? () }

                bridge.evaluateScript(application, sourceURL: "kuito://app") { [weak self] error in
                    if let error { self?.failed("Your app threw while starting", error, fatal: true) }
                }
            }
        } catch {
            failed("Hermes failed to start", error, fatal: true)
        }
    }

    /// Restarts the app in a fresh Hermes runtime, with `source` in place of the bundled app.
    func restart(source: String?) {
        hasFirstFrame = false
        engine?.shutdown()
        engine = nil
        renderer.clear()
        startEngine(source: source)
    }

    func fill(_ host: UIView, with child: UIView) {
        child.translatesAutoresizingMaskIntoConstraints = false
        host.addSubview(child)
        NSLayoutConstraint.activate([
            child.leadingAnchor.constraint(equalTo: host.leadingAnchor),
            child.trailingAnchor.constraint(equalTo: host.trailingAnchor),
            child.topAnchor.constraint(equalTo: host.topAnchor),
            child.bottomAnchor.constraint(equalTo: host.bottomAnchor),
        ])
    }

    // MARK: - Frames

    /// UI-thread records go to the UI runtime, in order with the view mutations
    /// around them. A `ui` record's operations stay with the UI runtime, which
    /// finds them by the record's index in the batch.
    private func apply(_ record: KuitoMutationRecord, at index: Int) {
        switch record.operation {
        case .ui: engine?.receiveUIOperations(at: index)
        case .uiKernel: engine?.loadUIKernel(KuitoAppBundle.uiKernel(), hash: record.textValue)
        case .uiScript: engine?.evaluateUIScript(record.textValue, sourceURL: record.nameValue)
        case .uiBundle: engine?.loadUIBundle(KuitoAppBundle.uiBundle(), hash: record.textValue, sourceURL: record.nameValue)
        default:
            do {
                try renderer.apply(record)
            } catch {
                failed("Rendering a mutation of view \(record.id) failed", error)
            }
        }
    }
}

extension KuitoHostController: KuitoHermesBridgeDelegate {
    nonisolated func kuitoApplyBatch(_ batch: KuitoMutationBatch) {
        MainActor.assumeIsolated {
            KuitoTrace.traced("Kuito commit", batch.count) {
                KuitoCommitStats.commit(sentAt: batch.sentAt, records: batch.count, hostCalls: batch.hostCalls) {
                    renderer.marksLayout = batch.marksLayout
                    for (index, record) in UnsafeBufferPointer(start: batch.records, count: batch.count).enumerated() {
                        apply(record, at: index)
                    }
                    renderer.marksLayout = true
                }
            }
        }
    }

    nonisolated func kuitoDidCommitFrames() {
        MainActor.assumeIsolated { KuitoSplash.shared.framesCommitted() }
    }

    nonisolated func kuitoDidLog(_ level: String, message: String, stack: String) {
        MainActor.assumeIsolated { log(level, message, stack: stack) }
    }

    nonisolated func kuitoUIDidSetProps(_ props: KuitoMutationBatch) {
        MainActor.assumeIsolated {
            renderer.marksLayout = props.marksLayout
            for record in UnsafeBufferPointer(start: props.records, count: props.count) {
                do {
                    try renderer.applyDriven(record)
                } catch {
                    failed("UI thread \(record.propName) of view \(record.id) failed", error)
                }
            }
            renderer.marksLayout = true
        }
    }
}
