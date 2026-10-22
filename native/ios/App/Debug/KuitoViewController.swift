import UIKit

/// The development shell: the app Live Patched by the dev server, under the
/// devtools' overlays. It owns the dev link, the debugger and the LogBox.
@MainActor
final class KuitoViewController: KuitoHostController {
    private let devtools: KuitoDevtools
    private let loading = KuitoLoadingView()
    private let pill = KuitoPatchPill()
    private let monitor = KuitoPerformanceMonitor()
    private let receipts = KuitoFrameReceipts()
    private let highlighter = KuitoUpdateHighlighter()
    private let logBox = KuitoLogBox()
    private let logToast = KuitoLogToast()

    private var deviceConnection: KuitoDeviceConnection?
    /// DevTools' way in (docs/devtools.md); one for the app, so a debugging
    /// session carries over to the runtimes a reload brings.
    private let debugger = KuitoInspector()
    private let inspectOverlay = KuitoInspectOverlay()
    /// What the kernel last heard of Highlight updates; nil until it asks.
    private var reportedUpdates: Bool?
    /// The last source the dev server sent, so Reload restarts the current app.
    private var latestSource: String?
    private var patchStarted: CFTimeInterval = 0

    override var inspector: KuitoInspector? { debugger }

    override var blankBackground: UIColor { KuitoDevTheme.ink }

    #if targetEnvironment(simulator)
    /// A simulator shares the Mac's loopback, where `kuito dev` serves by default.
    private static let defaultServer = URL(string: "ws://127.0.0.1:8765")
    #else
    /// A phone's 127.0.0.1 is the phone itself: only `kuito dev` knows where its server is.
    private static let defaultServer: URL? = nil
    #endif

    /// Where `kuito dev` said its server is; nil for a phone app opened some other way.
    private let server: URL?

    override init() {
        server = ProcessInfo.processInfo.environment["KUITO_DEV_URL"].flatMap(URL.init(string:))
            ?? Self.defaultServer
        // The devtools' address field starts from it, or from the usual one to edit.
        devtools = KuitoDevtools(url: server ?? URL(string: "ws://127.0.0.1:8765")!)
        super.init()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        devtools.reconnect = { [weak self] in self?.connect() }
        devtools.reload = { [weak self] in self?.reload() }
        devtools.observe { [weak self] in self?.applySettings() }

        if server != nil {
            connect()
        } else {
            loading.show("Start this app from kuito dev: it tells the app where its dev server is.")
        }
    }

    override func install() {
        installOverlays()
        installReceipts()
        renderer.devtools = self
        inspectOverlay.onPick = { [weak self] point in self?.pick(at: point) }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        becomeFirstResponder()
    }

    // MARK: - Devtools access: ⌘D, shake, or `m` in kuito dev

    override var canBecomeFirstResponder: Bool { true }

    override var keyCommands: [UIKeyCommand]? {
        let command = UIKeyCommand(title: "Kuito Devtools", action: #selector(toggleDevtools), input: "d", modifierFlags: .command)

        command.wantsPriorityOverSystemBehavior = true

        return [command]
    }

    override func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        if motion == .motionShake { toggleDevtools() }
    }

    @objc private func toggleDevtools() {
        if let presented = presentedViewController as? KuitoDevtoolsController {
            presented.dismiss(animated: true)

            return
        }

        topmost.present(KuitoDevtoolsController(devtools: devtools), animated: true)
    }

    private var topmost: UIViewController {
        var host: UIViewController = self

        while let next = host.presentedViewController, !next.isBeingDismissed { host = next }

        return host
    }

    // MARK: - LogBox

    /// Every console entry prints in Xcode and the terminal; warnings and errors also show here.
    override func log(_ level: String, _ message: String, stack: String) {
        super.log(level, message, stack: stack)

        let entry = logBox.record(level: level, message: message, stack: stack)

        deviceConnection?.sendLog(level: level, message: message, stack: stack, id: entry?.id)

        if entry?.level == .fatal { inspect(entry?.id) }
    }

    private func inspect(_ id: String?) {
        guard let id = id ?? logBox.entries.last?.id else { return }

        if let open = topmost as? KuitoLogInspector { return open.turn(to: id) }

        let inspector = KuitoLogInspector(logBox: logBox, entry: id)

        inspector.connected = devtools.connection == .connected
        inspector.onReload = { [weak self] in self?.reload() }
        inspector.onOpen = { [weak self] file, line, column in
            self?.deviceConnection?.open(file: file, line: line, column: column)
        }
        topmost.present(inspector, animated: true)
    }

    // MARK: - Frame receipts

    /// Every dropped frame goes to the LogBox, `kuito dev` and the
    /// performance monitor with what ran in it (docs/performance.md#frame-receipts).
    private func installReceipts() {
        receipts.nameView = { [weak self] id in
            self?.renderer.nodes[id].map { KuitoFrameReceipts.name(id, kind: $0.kind, label: $0.label) } ?? "view \(id)"
        }
        receipts.onFrame = { [weak self] vsync, interval, verdict in
            self?.monitor.frame(vsync: vsync, interval: interval, verdict: verdict)
        }
        receipts.onDrop = { [weak self] line, warn in
            self?.monitor.showDrop(line)
            self?.log(warn ? "warn" : "info", line, stack: "")
        }
        receipts.start()

        if !KuitoAblation.error.isEmpty { log("error", KuitoAblation.error, stack: "") }
        if !KuitoAblation.setting.isEmpty {
            log("warn", "KUITO_ABLATE=\(KuitoAblation.setting): this run slows or skips that work, to measure what it costs (docs/performance.md#ablation)", stack: "")
        }
    }

    // MARK: - Overlays

    private func installOverlays() {
        fill(view, with: highlighter)

        monitor.install(in: view)
        pill.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(pill)

        NSLayoutConstraint.activate([
            pill.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
            pill.centerXAnchor.constraint(equalTo: view.centerXAnchor),
        ])

        pill.onTap = { [weak self] in self?.toggleDevtools() }
        logToast.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(logToast)

        NSLayoutConstraint.activate([
            logToast.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
            logToast.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
            logToast.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -8),
        ])

        logToast.onOpen = { [weak self] in self?.inspect(nil) }
        logToast.onDismiss = { [weak self] in self?.logBox.clear() }
        logBox.observe { [weak self] in
            guard let self else { return }

            self.logToast.show(self.logBox)
        }
        fill(view, with: loading)
        loading.show("Starting Hermes…")
    }

    private func applySettings() {
        monitor.isHidden = !devtools.showsPerformance
        highlighter.isHidden = !devtools.highlightsUpdates && !highlighter.hasOutlines

        if devtools.showsPerformance { monitor.start() } else { monitor.stop() }

        reportUpdates()
    }

    override func rendered(_ view: UIView) {
        if devtools.highlightsUpdates { highlighter.updated(view) }
    }

    override func firstFrame() {
        // The splash is the loading screen at launch: it goes in the frame
        // the app shows, so nothing of the dev loading view may show under it.
        if KuitoSplash.shared.isVisible {
            loading.removeFromSuperview()
        } else {
            // Let the first batch lay out before the reveal.
            DispatchQueue.main.async { [weak self] in self?.loading.finish() }
        }
    }

    // MARK: - Engine and connection

    override func startEngine(source: String?) {
        // The server replays its latest build on connect: the app just started is that build.
        do {
            latestSource = try source ?? KuitoAppBundle.appSource()
        } catch {
            return failed("Hermes failed to start", error, fatal: true)
        }

        loading.show("Loading your app…")
        super.startEngine(source: source)
    }

    private func connect() {
        deviceConnection?.stop()

        let connection = KuitoDeviceConnection(url: devtools.url)

        debugger.connect(to: devtools.url)
        connection.onState = { [weak self] state in self?.connectionChanged(state) }
        connection.onPatch = { [weak self] source, revision in self?.applyPatch(source, revision: revision) }
        connection.onCommand = { [weak self] name in self?.command(name) }
        connection.onSymbolicated = { [weak self] message in self?.logBox.symbolicated(message) }
        deviceConnection = connection
        connection.start()
    }

    private func connectionChanged(_ state: KuitoConnectionState) {
        let wasDisconnected: Bool

        if case .retrying = devtools.connection { wasDisconnected = true } else { wasDisconnected = false }

        devtools.connection = state

        // Once the app is up, a lost link shows in the pill instead.
        if hasFirstFrame {
            switch state {
            case .retrying(let delay, _): pill.disconnected(retryingIn: delay)
            case .connected where wasDisconnected: pill.reconnected()
            default: break
            }

            return
        }

        switch state {
        case .connecting: loading.show("Connecting to the dev server…")
        case .connected: loading.show("Waiting for your app…")
        case .retrying(_, let reason) where reason == KuitoDevSocket.refusedToken: loading.show(reason)
        case .retrying(let delay, _): loading.show("Dev server not reachable. Retrying in \(Int(delay.rounded(.up)))s…")
        }
    }

    private func applyPatch(_ source: String, revision: Int) {
        guard let engine else { return }

        // A reconnect replays the server's last patch: it is live already.
        guard source != latestSource else {
            deviceConnection?.applied(revision: revision, milliseconds: 0)
            return
        }

        latestSource = source
        patchStarted = CACurrentMediaTime()

        if hasFirstFrame { pill.updating() }

        engine.evaluateScript(Data(source.utf8), sourceURL: "kuito://patch/\(revision)") { [weak self] error in
            guard let self else { return }

            if let error {
                self.deviceConnection?.rejected(
                    revision: revision, code: KuitoPatchRejection.evaluation, message: error.localizedDescription)

                return self.failed("Live Patch \(revision) threw; the previous version stays live", error, fatal: true)
            }

            let milliseconds = (CACurrentMediaTime() - self.patchStarted) * 1000

            self.deviceConnection?.applied(revision: revision, milliseconds: milliseconds)
            self.logBox.clearFatal()
            self.devtools.patched(revision: revision, milliseconds: milliseconds)

            if self.hasFirstFrame { self.pill.updated(milliseconds: milliseconds) }
        }
    }

    private func command(_ name: String) {
        if name == "devtools" { toggleDevtools() }
        if name == "record" { sendRecording() }
    }

    /// Restarts the app in a fresh Hermes runtime.
    private func reload() {
        fill(view, with: loading)
        loading.alpha = 1
        loading.transform = .identity
        logBox.clear()
        restart(source: latestSource)
    }

    /// A failure of `what`; a JavaScript error brings its own message and stack.
    /// Code that failed to run is fatal and opens the LogBox until a patch fixes it.
    override func failed(_ what: String, _ error: Error? = nil, fatal: Bool = false) {
        let (message, stack) = describe(what, error)

        devtools.failed([what, error?.localizedDescription].compactMap { $0 }.joined(separator: ": "))
        log(fatal || !hasFirstFrame ? "fatal" : "error", message, stack: stack)

        // Code that failed to run leaves nothing to hand off to: show why.
        if fatal { KuitoSplash.shared.dismiss() }

        if hasFirstFrame {
            pill.failed()
        } else {
            loading.show(what)
        }
    }
}

/// Recordings (docs/devtools.md#recording-and-replay).
extension KuitoViewController {
    /// Answers `record`: the runtime's batches so far and the view tree they built.
    fileprivate func sendRecording() {
        guard let engine else { return failed("Recording failed: no app is running") }

        engine.recording { [weak self] recording, error in
            guard let self else { return }
            guard let recording else { return self.failed("Recording failed", error) }

            self.deviceConnection?.recording(recording, tree: self.renderer.describeTree())
        }
    }
}

/// The Components panel's outlines and tap-to-select (docs/devtools.md).
extension KuitoViewController: KuitoDevtoolsOverlay {
    func highlight(_ views: [UIView]) {
        highlighter.outline(views)
        applySettings()
    }

    func inspect(_ enabled: Bool) {
        if enabled { fill(view, with: inspectOverlay) } else { inspectOverlay.removeFromSuperview() }
    }

    func hello() {
        reportedUpdates = nil
        reportUpdates()
    }

    func cause(_ view: UIView, _ text: String) {
        highlighter.caused(view, text)
    }

    /// The kernel names each update's cause only while the highlighter shows it.
    private func reportUpdates() {
        guard let engine, reportedUpdates != devtools.highlightsUpdates else { return }

        let on = devtools.highlightsUpdates

        reportedUpdates = on

        engine.dispatchEvent(handle: 0, event: "devtools.updates", payload: KuitoDevtoolsUpdatesPayload(on: on)) { [weak self] error in
            if let error { self?.failed("Reporting Highlight updates failed", error) }
        }
    }

    /// The kernel finds the component that rendered the view, and ends the inspection.
    private func pick(at point: CGPoint) {
        guard let id = renderer.id(at: inspectOverlay.convert(point, to: surface)) else { return }

        engine?.dispatchEvent(handle: 0, event: "devtools.select", payload: KuitoDevtoolsSelectPayload(view: Double(id))) { [weak self] error in
            if let error { self?.failed("Selecting \(id) failed", error) }
        }
    }
}
