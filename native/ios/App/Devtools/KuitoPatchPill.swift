import UIKit

/// A pill under the status bar for Live Patch: "Updating…", then "Updated in
/// 18 ms"; a failure stays until tapped, which opens the devtools.
@MainActor
final class KuitoPatchPill: UIView {
    var onTap: (() -> Void)?

    private let dot = UIView()
    private let text = UILabel()
    private var hide: DispatchWorkItem?

    override init(frame: CGRect) {
        super.init(frame: frame)
        alpha = 0
        backgroundColor = KuitoDevTheme.ink.withAlphaComponent(0.92)
        layer.cornerRadius = 17
        layer.borderWidth = 1
        layer.borderColor = KuitoDevTheme.hairline.cgColor
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0.3
        layer.shadowRadius = 12
        dot.layer.cornerRadius = 4
        text.font = KuitoDevTheme.font(13, .semibold)
        text.textColor = KuitoDevTheme.text

        let row = UIStackView(arrangedSubviews: [dot, text])

        row.spacing = 8
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)

        NSLayoutConstraint.activate([
            dot.widthAnchor.constraint(equalToConstant: 8),
            dot.heightAnchor.constraint(equalToConstant: 8),
            row.topAnchor.constraint(equalTo: topAnchor, constant: 8),
            row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -8),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 14),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
        ])

        addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tapped)))
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    func updating() {
        show("Updating…", KuitoDevTheme.warning, for: nil)
    }

    func updated(milliseconds: Double) {
        show(String(format: "Updated in %.0f ms", milliseconds), KuitoDevTheme.success, for: 1.6)
    }

    func disconnected(retryingIn delay: TimeInterval) {
        show("Dev server disconnected · retrying in \(Int(delay.rounded(.up)))s", KuitoDevTheme.warning, for: nil)
    }

    func reconnected() {
        show("Reconnected", KuitoDevTheme.success, for: 1.4)
    }

    func failed() {
        show("Update failed · tap for details", KuitoDevTheme.danger, for: nil)
    }

    private func show(_ message: String, _ color: UIColor, for duration: TimeInterval?) {
        hide?.cancel()
        text.text = message
        dot.backgroundColor = color
        isUserInteractionEnabled = duration == nil

        UIView.animate(withDuration: 0.25, delay: 0, usingSpringWithDamping: 0.8, initialSpringVelocity: 0) {
            self.alpha = 1
            self.transform = .identity
        }

        guard let duration else { return }

        let work = DispatchWorkItem { [weak self] in
            UIView.animate(withDuration: 0.3) {
                self?.alpha = 0
                self?.transform = CGAffineTransform(translationX: 0, y: -8)
            }
        }

        hide = work
        DispatchQueue.main.asyncAfter(deadline: .now() + duration, execute: work)
    }

    @objc private func tapped() {
        onTap?()
    }
}
