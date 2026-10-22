import UIKit

/// The LogBox at rest: one compact bar above the home indicator with the
/// latest entry and what else is waiting. It never covers more than itself.
@MainActor
final class KuitoLogToast: UIView {
    var onOpen: (() -> Void)?
    var onDismiss: (() -> Void)?

    private let badge = UILabel()
    private let title = UILabel()
    private let summary = UILabel()
    private let close = UIButton(type: .system)
    private var shown = false

    override init(frame: CGRect) {
        super.init(frame: frame)

        let blur = UIVisualEffectView(effect: UIBlurEffect(style: .systemChromeMaterialDark))

        blur.layer.cornerRadius = 18
        blur.layer.cornerCurve = .continuous
        blur.clipsToBounds = true
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0.35
        layer.shadowRadius = 18
        layer.shadowOffset = CGSize(width: 0, height: 8)

        badge.font = KuitoDevTheme.font(13, .heavy)
        badge.textColor = .black
        badge.textAlignment = .center
        badge.layer.cornerRadius = 13
        badge.layer.masksToBounds = true
        badge.setContentHuggingPriority(.required, for: .horizontal)
        badge.setContentCompressionResistancePriority(.required, for: .horizontal)
        title.font = KuitoDevTheme.font(15, .semibold)
        title.textColor = KuitoDevTheme.text
        summary.font = KuitoDevTheme.font(12, .medium)
        summary.textColor = KuitoDevTheme.muted
        close.setImage(UIImage(systemName: "xmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 12, weight: .bold)), for: .normal)
        close.tintColor = KuitoDevTheme.muted
        close.accessibilityLabel = "Dismiss all"
        close.addAction(UIAction { [weak self] _ in self?.onDismiss?() }, for: .touchUpInside)

        let text = UIStackView(arrangedSubviews: [title, summary])

        text.axis = .vertical
        text.spacing = 1
        text.setContentHuggingPriority(.defaultLow, for: .horizontal)

        let row = UIStackView(arrangedSubviews: [badge, text, close])

        row.alignment = .center
        row.spacing = 12

        for view in [blur, row] {
            view.translatesAutoresizingMaskIntoConstraints = false
            addSubview(view)
        }

        NSLayoutConstraint.activate([
            blur.leadingAnchor.constraint(equalTo: leadingAnchor),
            blur.trailingAnchor.constraint(equalTo: trailingAnchor),
            blur.topAnchor.constraint(equalTo: topAnchor),
            blur.bottomAnchor.constraint(equalTo: bottomAnchor),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
            row.topAnchor.constraint(equalTo: topAnchor, constant: 10),
            row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -10),
            badge.widthAnchor.constraint(greaterThanOrEqualToConstant: 26),
            badge.heightAnchor.constraint(equalToConstant: 26),
            close.widthAnchor.constraint(equalToConstant: 36),
            close.heightAnchor.constraint(equalToConstant: 36),
        ])

        addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(open)))
        isAccessibilityElement = false
        alpha = 0
        isHidden = true
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    /// Shows the newest entry; hides when the LogBox is empty.
    func show(_ logBox: KuitoLogBox) {
        guard let latest = logBox.entries.last else { return hide() }

        let errors = logBox.count(.error)
        let warnings = logBox.count(.warn)
        let tint = latest.level == .warn ? KuitoDevTheme.warning : KuitoDevTheme.danger

        badge.backgroundColor = tint
        badge.text = latest.count > 1 ? "\(latest.count)" : (latest.level == .warn ? "!" : "×")
        title.text = latest.title
        summary.text = [
            errors > 0 ? "\(errors) \(errors == 1 ? "error" : "errors")" : nil,
            warnings > 0 ? "\(warnings) \(warnings == 1 ? "warning" : "warnings")" : nil,
            "tap to inspect",
        ].compactMap { $0 }.joined(separator: " · ")

        guard !shown else { return }

        shown = true
        isHidden = false
        transform = CGAffineTransform(translationX: 0, y: 40)
        UIView.animate(withDuration: 0.45, delay: 0, usingSpringWithDamping: 0.8, initialSpringVelocity: 0.4) {
            self.alpha = 1
            self.transform = .identity
        }
    }

    private func hide() {
        guard shown else { return }

        shown = false
        UIView.animate(withDuration: 0.2, animations: {
            self.alpha = 0
            self.transform = CGAffineTransform(translationX: 0, y: 30)
        }, completion: { _ in
            if !self.shown { self.isHidden = true }
        })
    }

    @objc private func open() {
        onOpen?()
    }
}
