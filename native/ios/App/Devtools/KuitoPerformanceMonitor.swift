import UIKit

/// A heads-up display over the app: UI-thread frames per second, the main
/// thread's longest work in a frame and the frames it dropped, a graph of
/// recent frame rates against the display's target, Kuito's commits
/// (prop parses per commit, touch-to-applied latency), the JSON crossing
/// its boundaries per frame and the last dropped frame's receipt
/// (KuitoFrameReceipts). Drag it anywhere; it settles in the nearest
/// corner, which is remembered.
@MainActor
final class KuitoPerformanceMonitor: UIView {
    private let fps = UILabel()
    private let detail = UILabel()
    private let commits = UILabel()
    private let wire = UILabel()
    private let drop = UILabel()
    private let graph = FrameGraph()
    private var running = false
    private var started = false
    private var windowStart: CFTimeInterval = 0
    private var windowFrames = 0
    private var windowWork: CFTimeInterval = 0
    private var dropped = 0
    private var windowCommits = 0
    private var windowParses = 0
    private var windowWire = KuitoHermesBridge.wireWork()
    private var placement: [NSLayoutConstraint] = []

    /// 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right.
    private var corner = UserDefaults.standard.object(forKey: "kuito.performance.corner") as? Int ?? 3 {
        didSet { UserDefaults.standard.set(corner, forKey: "kuito.performance.corner") }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = KuitoDevTheme.ink.withAlphaComponent(0.88)
        layer.cornerRadius = 14
        layer.borderWidth = 1
        layer.borderColor = KuitoDevTheme.hairline.cgColor
        fps.font = KuitoDevTheme.mono(17, .bold)
        detail.font = KuitoDevTheme.mono(10)
        detail.textColor = KuitoDevTheme.muted
        commits.font = KuitoDevTheme.mono(10)
        commits.textColor = KuitoDevTheme.muted
        commits.text = "JS · no commits"
        wire.font = KuitoDevTheme.mono(10)
        wire.textColor = KuitoDevTheme.muted
        wire.text = "JSON · none"
        drop.font = KuitoDevTheme.mono(10)
        drop.textColor = KuitoDevTheme.muted
        drop.numberOfLines = 3
        drop.text = "Last drop · none"

        let titles = UIStackView(arrangedSubviews: [fps, detail, commits, wire, drop])
        let row = UIStackView(arrangedSubviews: [titles, graph])

        titles.axis = .vertical
        titles.spacing = 1
        row.spacing = 10
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)

        NSLayoutConstraint.activate([
            row.topAnchor.constraint(equalTo: topAnchor, constant: 8),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
            row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -8),
            graph.widthAnchor.constraint(equalToConstant: 96),
            graph.heightAnchor.constraint(equalToConstant: 34),
            fps.widthAnchor.constraint(greaterThanOrEqualToConstant: 64),
            drop.widthAnchor.constraint(lessThanOrEqualToConstant: 260),
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    /// Adds the monitor to `host` in its remembered corner.
    func install(in host: UIView) {
        translatesAutoresizingMaskIntoConstraints = false
        host.addSubview(self)
        addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(drag(_:))))
        place(in: corner)
    }

    private func place(in corner: Int) {
        guard let host = superview else { return }

        let guide = host.safeAreaLayoutGuide

        NSLayoutConstraint.deactivate(placement)
        placement = [
            corner < 2
                ? topAnchor.constraint(equalTo: guide.topAnchor, constant: 8)
                : bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -8),
            corner % 2 == 0
                ? leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 12)
                : trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -12),
        ]
        NSLayoutConstraint.activate(placement)
        self.corner = corner
    }

    @objc private func drag(_ gesture: UIPanGestureRecognizer) {
        guard let host = superview else { return }

        let moved = gesture.translation(in: host)

        switch gesture.state {
        case .changed:
            transform = CGAffineTransform(translationX: moved.x, y: moved.y).scaledBy(x: 1.04, y: 1.04)
        case .ended, .cancelled:
            // The corner nearest to where the monitor was released, nudged by the fling.
            let velocity = gesture.velocity(in: host)
            let landing = CGPoint(x: center.x + moved.x + velocity.x * 0.1, y: center.y + moved.y + velocity.y * 0.1)
            let next = (landing.y < host.bounds.midY ? 0 : 2) + (landing.x < host.bounds.midX ? 0 : 1)
            let start = frame.origin

            place(in: next)
            host.layoutIfNeeded()

            let target = frame.origin

            transform = CGAffineTransform(translationX: start.x - target.x + moved.x, y: start.y - target.y + moved.y)

            UIView.animate(withDuration: 0.45, delay: 0, usingSpringWithDamping: 0.75, initialSpringVelocity: 0.4) {
                self.transform = .identity
            }
        default:
            break
        }
    }

    /// Shows frames from now on.
    func start() {
        running = true
        started = false
        dropped = 0
        windowFrames = 0
        windowWork = 0
    }

    func stop() {
        running = false
    }

    /// The last dropped frame's receipt, as KuitoFrameReceipts words it.
    func showDrop(_ line: String) {
        drop.text = "Last drop · " + line
    }

    /// A display frame: its vsync, the display's interval and the frame rule's
    /// verdict (KuitoFrameReceipts).
    func frame(vsync now: Double, interval: Double, verdict frame: KuitoFrameVerdict) {
        guard running else { return }

        guard started else {
            started = true
            windowStart = now

            return
        }

        windowWork = max(windowWork, frame.work)
        dropped += frame.dropped
        windowFrames += 1

        guard now - windowStart >= 0.5 else { return }

        let rate = Double(windowFrames) / (now - windowStart)
        let target = 1 / max(interval, 0.001)
        let health = rate / target

        fps.text = String(format: "%.0f fps", rate)
        fps.textColor = health > 0.92 ? KuitoDevTheme.success : health > 0.7 ? KuitoDevTheme.warning : KuitoDevTheme.danger
        detail.text = String(format: "UI · %.1f ms · %d dropped", windowWork * 1000, dropped)
        graph.add(rate, target: target)
        showCommits()
        showWire(frames: windowFrames)
        windowStart = now
        windowFrames = 0
        windowWork = 0
    }

    /// Parses per commit over the last window; the latency of the last touch the app answered.
    private func showCommits() {
        let count = KuitoCommitStats.commits - windowCommits
        let parses = KuitoCommitStats.parses - windowParses
        let touch = KuitoCommitStats.lastLatency.map { last in
            String(format: " · touch %.0f ms (p95 %.0f)", last * 1000, (KuitoCommitStats.p95Latency ?? last) * 1000)
        } ?? ""

        windowCommits = KuitoCommitStats.commits
        windowParses = KuitoCommitStats.parses

        guard count > 0 || !touch.isEmpty else { return }

        commits.text = (count > 0 ? String(format: "JS · %.0f parses/commit", Double(parses) / Double(count)) : "JS · idle") + touch
    }

    /// JSON parsed and made per display frame over the last window, every runtime's
    /// and the renderer's (docs/performance.md#json-at-the-boundary).
    private func showWire(frames: Int) {
        let work = KuitoHermesBridge.wireWork()
        let parses = Double(work.jsonParses - windowWire.jsonParses) / Double(max(frames, 1))
        let bytes = Double(work.bytesStringified - windowWire.bytesStringified) / Double(max(frames, 1))

        windowWire = work
        wire.text = String(format: "JSON · %.1f parses/frame · %.0f B/frame", parses, bytes)
    }

    /// FPS over the last 15 seconds, one point per half second: a filled line
    /// against the display's target rate, colored by how close it stays.
    private final class FrameGraph: UIView {
        private var samples: [Double] = []
        private var target: Double = 60
        private let caption = UILabel()

        override init(frame: CGRect) {
            super.init(frame: frame)
            isOpaque = false
            backgroundColor = .clear
            caption.font = KuitoDevTheme.mono(8, .semibold)
            caption.textColor = KuitoDevTheme.muted
            addSubview(caption)
        }

        required init?(coder: NSCoder) {
            fatalError("init(coder:) is not supported")
        }

        func add(_ rate: Double, target: Double) {
            samples.append(min(rate, target))
            samples = Array(samples.suffix(30))
            self.target = target
            caption.text = String(format: "%.0f", target)
            caption.sizeToFit()
            caption.frame.origin = CGPoint(x: bounds.width - caption.bounds.width, y: -1)
            setNeedsDisplay()
        }

        override func draw(_ rect: CGRect) {
            guard let context = UIGraphicsGetCurrentContext(), samples.count > 1 else { return }

            let top: CGFloat = 8
            let height = rect.height - top
            let step = rect.width / 29
            let start = rect.width - CGFloat(samples.count - 1) * step
            let point = { (index: Int) in
                CGPoint(x: start + CGFloat(index) * step, y: top + height * CGFloat(1 - self.samples[index] / self.target))
            }
            let worst = samples.min() ?? target
            let color = worst / target > 0.92 ? KuitoDevTheme.success : worst / target > 0.7 ? KuitoDevTheme.warning : KuitoDevTheme.danger
            let line = UIBezierPath()

            line.move(to: point(0))

            for index in 1..<samples.count { line.addLine(to: point(index)) }

            let area = line.copy() as? UIBezierPath ?? UIBezierPath()

            area.addLine(to: CGPoint(x: point(samples.count - 1).x, y: rect.height))
            area.addLine(to: CGPoint(x: start, y: rect.height))
            area.close()

            // The target rate.
            context.setFillColor(KuitoDevTheme.muted.withAlphaComponent(0.35).cgColor)
            context.fill(CGRect(x: 0, y: top, width: rect.width - 14, height: 0.5))

            context.setFillColor(color.withAlphaComponent(0.22).cgColor)
            area.fill()
            color.setStroke()
            line.lineWidth = 1.5
            line.lineJoinStyle = .round
            line.stroke()
        }
    }
}
