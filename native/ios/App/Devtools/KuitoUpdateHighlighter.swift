import UIKit

/// Flashes an outline over each view the renderer updates, like react-scan:
/// green for a first update, amber then red as the same view keeps updating
/// within a second, with a count badge and the signal write that caused it.
/// It never takes touches.
@MainActor
final class KuitoUpdateHighlighter: UIView {
    private var pending: [ObjectIdentifier: UIView] = [:]
    /// The write behind each pending update, as the kernel names it.
    private var causes: [ObjectIdentifier: String] = [:]
    /// When each view was updated within the last second.
    private var recent: [ObjectIdentifier: [CFTimeInterval]] = [:]
    private var scheduled = false
    /// The Components panel's selection: outlines that stay until replaced.
    private var outlines: [CAShapeLayer] = []

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        backgroundColor = .clear
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    var hasOutlines: Bool { !outlines.isEmpty }

    /// Outlines `views` until the next call; none clears them.
    func outline(_ views: [UIView]) {
        outlines.forEach { $0.removeFromSuperlayer() }
        outlines = views.filter { $0.window != nil }.map { view in
            let shape = CAShapeLayer()

            shape.path = UIBezierPath(roundedRect: view.convert(view.bounds, to: self), cornerRadius: 4).cgPath
            shape.fillColor = KuitoDevTheme.accent.withAlphaComponent(0.18).cgColor
            shape.strokeColor = KuitoDevTheme.accent.cgColor
            shape.lineWidth = 2
            layer.addSublayer(shape)

            return shape
        }
    }

    /// `view`'s next flash names `cause`; the kernel sends it with the update.
    func caused(_ view: UIView, _ cause: String) {
        causes[ObjectIdentifier(view)] = cause
    }

    /// Several updates to one view in a frame flash once.
    func updated(_ view: UIView) {
        pending[ObjectIdentifier(view)] = view

        guard !scheduled else { return }

        scheduled = true
        DispatchQueue.main.async { [weak self] in self?.flush() }
    }

    private func flush() {
        scheduled = false

        let now = CACurrentMediaTime()

        for (key, view) in pending {
            guard view.window != nil, !view.bounds.isEmpty else { continue }

            let times = (recent[key] ?? []).filter { now - $0 < 1 } + [now]

            recent[key] = times
            flash(view.convert(view.bounds, to: self), count: times.count, cause: causes[key])
        }

        pending.removeAll()
        causes.removeAll()
        recent = recent.filter { _, times in times.contains { now - $0 < 1 } }
    }

    private func flash(_ rect: CGRect, count: Int, cause: String?) {
        let color = count >= 5 ? KuitoDevTheme.danger : count >= 2 ? KuitoDevTheme.warning : KuitoDevTheme.success
        let outline = CAShapeLayer()

        outline.path = UIBezierPath(roundedRect: rect.insetBy(dx: 1, dy: 1), cornerRadius: 6).cgPath
        outline.fillColor = color.withAlphaComponent(0.08).cgColor
        outline.strokeColor = color.cgColor
        outline.lineWidth = 2
        layer.addSublayer(outline)

        var layers: [CALayer] = [outline]

        if count > 1 {
            let badge = CATextLayer()

            badge.string = "×\(count)"
            badge.font = KuitoDevTheme.mono(10, .bold)
            badge.fontSize = 10
            badge.alignmentMode = .center
            badge.foregroundColor = KuitoDevTheme.ink.cgColor
            badge.backgroundColor = color.cgColor
            badge.cornerRadius = 4
            badge.contentsScale = traitCollection.displayScale
            badge.frame = CGRect(x: rect.maxX - 28, y: rect.minY, width: 26, height: 14)
            layer.addSublayer(badge)
            layers.append(badge)
        }

        if let cause { layers.append(label(cause, under: rect, color: color)) }

        let fade = CABasicAnimation(keyPath: "opacity")

        fade.fromValue = 1
        fade.toValue = 0
        fade.duration = 0.7
        fade.timingFunction = CAMediaTimingFunction(name: .easeIn)

        CATransaction.begin()
        CATransaction.setCompletionBlock { layers.forEach { $0.removeFromSuperlayer() } }

        for layer in layers {
            layer.opacity = 0
            layer.add(fade, forKey: "fade")
        }

        CATransaction.commit()
    }

    /// The cause, in a pill under the flash, or over it at the bottom of the screen.
    private func label(_ text: String, under rect: CGRect, color: UIColor) -> CALayer {
        let font = KuitoDevTheme.mono(10, .semibold)
        let width = min((text as NSString).size(withAttributes: [.font: font]).width + 10, bounds.width - 4)
        let height: CGFloat = 16
        let y = rect.maxY + height + 2 <= bounds.maxY ? rect.maxY + 2 : rect.minY - height - 2
        let pill = CATextLayer()

        pill.string = text
        pill.font = font
        pill.fontSize = 10
        pill.truncationMode = .end
        pill.alignmentMode = .center
        pill.foregroundColor = KuitoDevTheme.ink.cgColor
        pill.backgroundColor = color.cgColor
        pill.cornerRadius = 4
        pill.contentsScale = traitCollection.displayScale
        pill.frame = CGRect(x: max(2, min(rect.minX, bounds.maxX - width - 2)), y: y, width: width, height: height)
        layer.addSublayer(pill)

        return pill
    }
}
