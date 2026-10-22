import UIKit

/// The startup screen: shown until the app's first frame, with what the shell
/// is waiting for. It fades out as soon as there is something to show.
@MainActor
final class KuitoLoadingView: UIView {
    private let status = UILabel()
    private let mark = UIView()
    private let glyph = UILabel()
    private let ring = CAShapeLayer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = KuitoDevTheme.ink

        mark.backgroundColor = KuitoDevTheme.accent
        mark.layer.cornerRadius = 22
        mark.layer.shadowColor = KuitoDevTheme.accent.cgColor
        mark.layer.shadowOpacity = 0.6
        mark.layer.shadowRadius = 24
        mark.layer.shadowOffset = .zero
        glyph.text = "◆"
        glyph.textColor = .white
        glyph.font = KuitoDevTheme.font(34, .bold)
        glyph.textAlignment = .center

        let title = UILabel()

        title.text = "Kuito"
        title.textColor = KuitoDevTheme.text
        title.font = KuitoDevTheme.font(26, .bold)
        status.textColor = KuitoDevTheme.muted
        status.font = KuitoDevTheme.font(15)
        status.textAlignment = .center
        status.numberOfLines = 0

        ring.fillColor = UIColor.clear.cgColor
        ring.strokeColor = KuitoDevTheme.accent.cgColor
        ring.lineWidth = 2
        ring.lineCap = .round
        ring.strokeEnd = 0.3

        let indicator = UIView()

        indicator.layer.addSublayer(ring)

        for view in [mark, glyph, title, status, indicator] {
            view.translatesAutoresizingMaskIntoConstraints = false
            addSubview(view)
        }

        NSLayoutConstraint.activate([
            mark.centerXAnchor.constraint(equalTo: centerXAnchor),
            mark.centerYAnchor.constraint(equalTo: centerYAnchor, constant: -60),
            mark.widthAnchor.constraint(equalToConstant: 76),
            mark.heightAnchor.constraint(equalToConstant: 76),
            glyph.centerXAnchor.constraint(equalTo: mark.centerXAnchor),
            glyph.centerYAnchor.constraint(equalTo: mark.centerYAnchor),
            title.topAnchor.constraint(equalTo: mark.bottomAnchor, constant: 24),
            title.centerXAnchor.constraint(equalTo: centerXAnchor),
            indicator.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 28),
            indicator.centerXAnchor.constraint(equalTo: centerXAnchor),
            indicator.widthAnchor.constraint(equalToConstant: 22),
            indicator.heightAnchor.constraint(equalToConstant: 22),
            status.topAnchor.constraint(equalTo: indicator.bottomAnchor, constant: 16),
            status.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 40),
            status.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -40),
        ])

        ring.path = UIBezierPath(ovalIn: CGRect(x: 0, y: 0, width: 22, height: 22)).cgPath
        ring.frame = CGRect(x: 0, y: 0, width: 22, height: 22)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()

        guard window != nil else { return }

        let spin = CABasicAnimation(keyPath: "transform.rotation")

        spin.fromValue = 0
        spin.toValue = CGFloat.pi * 2
        spin.duration = 0.9
        spin.repeatCount = .infinity
        ring.add(spin, forKey: "spin")

        let breathe = CABasicAnimation(keyPath: "transform.scale")

        breathe.fromValue = 1
        breathe.toValue = 1.06
        breathe.duration = 1.2
        breathe.autoreverses = true
        breathe.repeatCount = .infinity
        breathe.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        mark.layer.add(breathe, forKey: "breathe")
    }

    func show(_ text: String) {
        UIView.transition(with: status, duration: 0.2, options: .transitionCrossDissolve) {
            self.status.text = text
        }
    }

    func finish() {
        UIView.animate(withDuration: 0.35, delay: 0, options: .curveEaseOut) {
            self.alpha = 0
            self.transform = CGAffineTransform(scaleX: 1.04, y: 1.04)
        } completion: { _ in
            self.removeFromSuperview()
        }
    }
}
