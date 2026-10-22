import UIKit

/// The devtools sheet: connection, Live Patch history, actions, monitors and
/// the last error. Opened with ⌘D in the simulator, by shaking a device, or
/// with `m` in the `kuito dev` terminal.
@MainActor
final class KuitoDevtoolsController: UIViewController {
    private let devtools: KuitoDevtools
    private let content = UIStackView()
    private var observation: UUID?

    private let statusDot = UIView()
    private let statusTitle = UILabel()
    private let statusDetail = UILabel()
    private let patchList = UIStackView()
    private let urlField = UITextField()
    private let performance = UISwitch()
    private let highlights = UISwitch()
    private let errorCard = UIView()
    private let errorText = UILabel()

    init(devtools: KuitoDevtools) {
        self.devtools = devtools
        super.init(nibName: nil, bundle: nil)
        overrideUserInterfaceStyle = .dark
        modalPresentationStyle = .pageSheet

        if let sheet = sheetPresentationController {
            sheet.detents = [.medium(), .large()]
            sheet.prefersGrabberVisible = true
            sheet.preferredCornerRadius = 28
            sheet.prefersScrollingExpandsWhenScrolledToEdge = true
        }
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = KuitoDevTheme.ink
        build()
        observation = devtools.observe { [weak self] in self?.refresh() }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)

        if let observation { devtools.unobserve(observation) }
    }

    // MARK: - Layout

    private func build() {
        let scroll = UIScrollView()

        scroll.alwaysBounceVertical = true
        scroll.translatesAutoresizingMaskIntoConstraints = false
        content.axis = .vertical
        content.spacing = 14
        content.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll)
        scroll.addSubview(content)

        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.topAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            content.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 28),
            content.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: 20),
            content.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -20),
            content.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -28),
        ])

        content.addArrangedSubview(header())
        content.addArrangedSubview(statusCard())
        content.addArrangedSubview(actions())
        content.addArrangedSubview(errorSection())
        content.addArrangedSubview(section("LIVE PATCH", card(patchList)))
        content.addArrangedSubview(section("MONITORS", monitors()))
        content.addArrangedSubview(section("DEV SERVER", serverCard()))
        content.addArrangedSubview(footer())
    }

    private func header() -> UIView {
        let mark = KuitoBrandMark()

        let title = label("Kuito Devtools", KuitoDevTheme.font(20, .bold), KuitoDevTheme.text)
        let subtitle = label("Hermes on device", KuitoDevTheme.font(13), KuitoDevTheme.muted)
        let titles = UIStackView(arrangedSubviews: [title, subtitle])
        let close = UIButton(type: .system)

        titles.axis = .vertical
        titles.spacing = 2
        close.setImage(UIImage(systemName: "xmark.circle.fill"), for: .normal)
        close.tintColor = KuitoDevTheme.muted
        close.addAction(UIAction { [weak self] _ in self?.dismiss(animated: true) }, for: .touchUpInside)

        let row = UIStackView(arrangedSubviews: [mark, titles, UIView(), close])

        row.alignment = .center
        row.spacing = 12
        NSLayoutConstraint.activate([
            mark.widthAnchor.constraint(equalToConstant: 36),
            mark.heightAnchor.constraint(equalToConstant: 36),
        ])

        return row
    }

    private func statusCard() -> UIView {
        statusDot.layer.cornerRadius = 5
        statusTitle.font = KuitoDevTheme.font(16, .semibold)
        statusTitle.textColor = KuitoDevTheme.text
        statusDetail.font = KuitoDevTheme.mono(12, .regular)
        statusDetail.textColor = KuitoDevTheme.muted
        statusDetail.numberOfLines = 2

        let titles = UIStackView(arrangedSubviews: [statusTitle, statusDetail])
        let row = UIStackView(arrangedSubviews: [statusDot, titles])

        titles.axis = .vertical
        titles.spacing = 4
        row.alignment = .center
        row.spacing = 12
        NSLayoutConstraint.activate([
            statusDot.widthAnchor.constraint(equalToConstant: 10),
            statusDot.heightAnchor.constraint(equalToConstant: 10),
        ])

        return card(row)
    }

    private func actions() -> UIView {
        let reload = actionButton("Reload", symbol: "arrow.clockwise", filled: true) { [weak self] in
            self?.devtools.reload?()
            self?.dismiss(animated: true)
        }
        let reconnect = actionButton("Reconnect", symbol: "bolt.horizontal.fill", filled: false) { [weak self] in
            self?.devtools.reconnect?()
        }
        let row = UIStackView(arrangedSubviews: [reload, reconnect])

        row.distribution = .fillEqually
        row.spacing = 12

        return row
    }

    private func errorSection() -> UIView {
        errorText.font = KuitoDevTheme.mono(12, .regular)
        errorText.textColor = KuitoDevTheme.text
        errorText.numberOfLines = 0

        let title = label("Last error", KuitoDevTheme.font(13, .semibold), KuitoDevTheme.danger)
        let dismiss = UIButton(type: .system)

        dismiss.setTitle("Clear", for: .normal)
        dismiss.tintColor = KuitoDevTheme.muted
        dismiss.addAction(UIAction { [weak self] _ in self?.devtools.clearError() }, for: .touchUpInside)

        let top = UIStackView(arrangedSubviews: [title, UIView(), dismiss])
        let stack = UIStackView(arrangedSubviews: [top, errorText])

        stack.axis = .vertical
        stack.spacing = 8
        errorCard.addSubview(stack)
        errorCard.backgroundColor = KuitoDevTheme.danger.withAlphaComponent(0.12)
        errorCard.layer.cornerRadius = 16
        errorCard.layer.borderWidth = 1
        errorCard.layer.borderColor = KuitoDevTheme.danger.withAlphaComponent(0.35).cgColor
        pin(stack, in: errorCard)

        return errorCard
    }

    private func monitors() -> UIView {
        performance.onTintColor = KuitoDevTheme.accent
        highlights.onTintColor = KuitoDevTheme.accent
        performance.addAction(UIAction { [weak self] _ in
            self?.devtools.showsPerformance = self?.performance.isOn ?? false
        }, for: .valueChanged)
        highlights.addAction(UIAction { [weak self] _ in
            self?.devtools.highlightsUpdates = self?.highlights.isOn ?? false
        }, for: .valueChanged)

        let rows = UIStackView(arrangedSubviews: [
            toggleRow("gauge.with.dots.needle.67percent", "Performance monitor", "FPS and frame times over your app", performance),
            divider(),
            toggleRow("rectangle.dashed", "Highlight updates", "Flash views each time the renderer updates them", highlights),
        ])

        rows.axis = .vertical
        rows.spacing = 14

        return card(rows)
    }

    private func serverCard() -> UIView {
        urlField.font = KuitoDevTheme.mono(14)
        urlField.textColor = KuitoDevTheme.text
        urlField.autocapitalizationType = .none
        urlField.autocorrectionType = .no
        urlField.keyboardType = .URL
        urlField.returnKeyType = .go
        urlField.backgroundColor = KuitoDevTheme.ink
        urlField.layer.cornerRadius = 10
        urlField.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 12, height: 1))
        urlField.leftViewMode = .always
        urlField.heightAnchor.constraint(equalToConstant: 44).isActive = true

        let connect = actionButton("Connect", symbol: "link", filled: false) { [weak self] in self?.connectToField() }

        urlField.addAction(UIAction { [weak self] _ in self?.connectToField() }, for: .editingDidEndOnExit)

        let stack = UIStackView(arrangedSubviews: [urlField, connect])

        stack.axis = .vertical
        stack.spacing = 10

        return card(stack)
    }

    private func footer() -> UIView {
        let hint = label("⌘D in the simulator · shake a device · m in kuito dev", KuitoDevTheme.font(12), KuitoDevTheme.muted)

        hint.textAlignment = .center
        hint.numberOfLines = 0

        return hint
    }

    // MARK: - State

    private func refresh() {
        let (title, color): (String, UIColor) = switch devtools.connection {
        case .connected: ("Connected", KuitoDevTheme.success)
        case .connecting: ("Connecting…", KuitoDevTheme.warning)
        case .retrying(let delay, _): ("Reconnecting in \(Int(delay.rounded(.up)))s", KuitoDevTheme.warning)
        }

        statusDot.backgroundColor = color
        statusTitle.text = title

        if case .retrying(_, let reason) = devtools.connection {
            statusDetail.text = reason
        } else {
            statusDetail.text = devtools.url.absoluteString
        }

        if !urlField.isFirstResponder { urlField.text = devtools.url.absoluteString }

        performance.isOn = devtools.showsPerformance
        highlights.isOn = devtools.highlightsUpdates
        errorCard.isHidden = devtools.lastError == nil
        errorText.text = devtools.lastError
        renderPatches()
    }

    private func renderPatches() {
        patchList.arrangedSubviews.forEach { $0.removeFromSuperview() }
        patchList.axis = .vertical
        patchList.spacing = 10

        guard !devtools.patches.isEmpty else {
            patchList.addArrangedSubview(label("No updates yet. Save a file to patch the app live.", KuitoDevTheme.font(14), KuitoDevTheme.muted))

            return
        }

        let formatter = RelativeDateTimeFormatter()

        formatter.unitsStyle = .short

        for patch in devtools.patches.prefix(5) {
            let revision = label("rev \(patch.revision)", KuitoDevTheme.mono(13, .semibold), KuitoDevTheme.text)
            let time = label(String(format: "%.0f ms", patch.milliseconds), KuitoDevTheme.mono(13), KuitoDevTheme.success)
            let when = label(formatter.localizedString(for: patch.date, relativeTo: Date()), KuitoDevTheme.font(13), KuitoDevTheme.muted)
            let row = UIStackView(arrangedSubviews: [revision, time, UIView(), when])

            row.spacing = 10
            patchList.addArrangedSubview(row)
        }
    }

    private func connectToField() {
        guard let text = urlField.text, let url = URL(string: text), url.scheme == "ws" || url.scheme == "wss" else {
            devtools.failed("“\(urlField.text ?? "")” is not a ws:// or wss:// URL")

            return
        }

        urlField.resignFirstResponder()
        devtools.url = url
        devtools.reconnect?()
    }

    // MARK: - Building blocks

    private func label(_ text: String, _ font: UIFont, _ color: UIColor) -> UILabel {
        let label = UILabel()

        label.text = text
        label.font = font
        label.textColor = color

        return label
    }

    private func section(_ title: String, _ body: UIView) -> UIView {
        let heading = label(title, KuitoDevTheme.font(12, .semibold), KuitoDevTheme.muted)
        let stack = UIStackView(arrangedSubviews: [heading, body])

        stack.axis = .vertical
        stack.spacing = 8
        stack.setCustomSpacing(10, after: heading)

        return stack
    }

    private func card(_ body: UIView) -> UIView {
        let card = UIView()

        card.backgroundColor = KuitoDevTheme.surface
        card.layer.cornerRadius = 18
        card.layer.borderWidth = 1
        card.layer.borderColor = KuitoDevTheme.hairline.cgColor
        card.addSubview(body)
        pin(body, in: card)

        return card
    }

    private func pin(_ body: UIView, in card: UIView) {
        body.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            body.topAnchor.constraint(equalTo: card.topAnchor, constant: 16),
            body.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 16),
            body.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),
            body.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -16),
        ])
    }

    private func divider() -> UIView {
        let line = UIView()

        line.backgroundColor = KuitoDevTheme.hairline
        line.heightAnchor.constraint(equalToConstant: 1).isActive = true

        return line
    }

    private func toggleRow(_ symbol: String, _ title: String, _ detail: String, _ toggle: UISwitch) -> UIView {
        let icon = UIImageView(image: UIImage(systemName: symbol))
        let titles = UIStackView(arrangedSubviews: [
            label(title, KuitoDevTheme.font(15, .semibold), KuitoDevTheme.text),
            label(detail, KuitoDevTheme.font(13), KuitoDevTheme.muted),
        ])
        let row = UIStackView(arrangedSubviews: [icon, titles, toggle])

        icon.tintColor = KuitoDevTheme.accent
        icon.contentMode = .scaleAspectFit
        icon.widthAnchor.constraint(equalToConstant: 24).isActive = true
        titles.axis = .vertical
        titles.spacing = 2
        (titles.arrangedSubviews[1] as? UILabel)?.numberOfLines = 0
        row.alignment = .center
        row.spacing = 12
        // The whole row toggles, not only the switch.
        row.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(toggleRow(_:))))

        return row
    }

    @objc private func toggleRow(_ gesture: UITapGestureRecognizer) {
        guard let toggle = gesture.view?.subviews.compactMap({ $0 as? UISwitch }).first else { return }

        toggle.setOn(!toggle.isOn, animated: true)
        toggle.sendActions(for: .valueChanged)
    }

    private func actionButton(_ title: String, symbol: String, filled: Bool, action: @escaping () -> Void) -> UIButton {
        var configuration = filled ? UIButton.Configuration.filled() : UIButton.Configuration.gray()

        configuration.title = title
        configuration.image = UIImage(systemName: symbol)
        configuration.imagePadding = 8
        configuration.cornerStyle = .large
        configuration.baseBackgroundColor = filled ? KuitoDevTheme.accent : KuitoDevTheme.raised
        configuration.baseForegroundColor = KuitoDevTheme.text
        configuration.contentInsets = NSDirectionalEdgeInsets(top: 14, leading: 12, bottom: 14, trailing: 12)

        return UIButton(configuration: configuration, primaryAction: UIAction { _ in action() })
    }
}
