import UIKit

/// One LogBox entry in full: the message, the code that produced it, and the
/// call stack with Kuito's own frames folded away. Frames open in the editor.
@MainActor
final class KuitoLogInspector: UIViewController {
    var onOpen: ((_ file: String, _ line: Int, _ column: Int) -> Void)?
    var onReload: (() -> Void)?
    /// Whether the dev server is reachable, so frames can still arrive.
    var connected = false

    private let logBox: KuitoLogBox
    private var entryId: String
    private var showsFramework = false
    private var observation: UUID?
    private let content = UIStackView()

    private static let time: DateFormatter = {
        let formatter = DateFormatter()

        formatter.dateFormat = "HH:mm:ss"

        return formatter
    }()

    init(logBox: KuitoLogBox, entry: String) {
        self.logBox = logBox
        entryId = entry
        super.init(nibName: nil, bundle: nil)
        overrideUserInterfaceStyle = .dark
        modalPresentationStyle = .pageSheet

        if let sheet = sheetPresentationController {
            sheet.detents = [.large()]
            sheet.prefersGrabberVisible = true
            sheet.preferredCornerRadius = 28
        }
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = KuitoDevTheme.ink
        build()
        observation = logBox.observe { [weak self] in self?.refresh() }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)

        if let observation { logBox.unobserve(observation) }
    }

    // MARK: - Layout

    private func build() {
        let scroll = UIScrollView()
        let footer = actions()

        scroll.alwaysBounceVertical = true
        content.axis = .vertical
        content.spacing = 18

        for item in [scroll, footer, content] { item.translatesAutoresizingMaskIntoConstraints = false }

        view.addSubview(scroll)
        view.addSubview(footer)
        scroll.addSubview(content)

        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.topAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: footer.topAnchor),
            footer.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            footer.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            footer.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -8),
            content.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 28),
            content.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: 20),
            content.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -20),
            content.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -20),
        ])
    }

    /// Turns to the entry, like a failure that arrived while the LogBox was open.
    func turn(to id: String) {
        entryId = id
        showsFramework = false
        refresh()
    }

    private func refresh() {
        let entries = logBox.entries
        let found = entries.firstIndex { $0.id == entryId }

        // A fixed failure closes its LogBox; a dismissed entry shows the next one.
        guard !entries.isEmpty, found != nil || !isModalInPresentation else { return dismiss(animated: true) }

        let index = found ?? entries.count - 1
        let entry = entries[index]

        entryId = entry.id
        isModalInPresentation = entry.level == .fatal

        for view in content.arrangedSubviews { view.removeFromSuperview() }

        content.addArrangedSubview(header(entry, position: index, of: entries.count))
        content.addArrangedSubview(message(entry))

        if let code = entry.codeFrame { content.addArrangedSubview(source(code)) }

        content.addArrangedSubview(stack(entry))
    }

    // MARK: - Sections

    private func header(_ entry: KuitoLogBox.Entry, position: Int, of total: Int) -> UIView {
        let tint = color(entry.level)
        let chip = PaddedLabel(text: label(entry.level).uppercased(), color: tint)
        let when = UILabel()

        when.text = entry.count > 1
            ? "×\(entry.count) · last at \(Self.time.string(from: entry.date))"
            : Self.time.string(from: entry.date)
        when.font = KuitoDevTheme.mono(12)
        when.textColor = KuitoDevTheme.muted

        let previous = iconButton("chevron.left", label: "Previous") { [weak self] in self?.page(-1) }
        let next = iconButton("chevron.right", label: "Next") { [weak self] in self?.page(1) }
        let counter = UILabel()

        counter.text = "\(position + 1) / \(total)"
        counter.font = KuitoDevTheme.mono(13, .semibold)
        counter.textColor = KuitoDevTheme.text
        previous.isEnabled = position > 0
        next.isEnabled = position < total - 1

        let close = iconButton("xmark", label: "Close") { [weak self] in self?.dismiss(animated: true) }
        let row = UIStackView(arrangedSubviews: [chip, when, UIView(), previous, counter, next, close])

        row.alignment = .center
        row.spacing = 8
        row.setCustomSpacing(4, after: previous)
        row.setCustomSpacing(4, after: counter)
        row.setCustomSpacing(14, after: next)

        return row
    }

    private func message(_ entry: KuitoLogBox.Entry) -> UIView {
        let title = UILabel()
        let lines = entry.message.split(separator: "\n", maxSplits: 1)

        title.text = entry.title
        title.font = KuitoDevTheme.font(22, .bold)
        title.textColor = KuitoDevTheme.text
        title.numberOfLines = 0

        let column = UIStackView(arrangedSubviews: [title])

        column.axis = .vertical
        column.spacing = 8

        if lines.count > 1 {
            let rest = UILabel()

            rest.text = String(lines[1])
            rest.font = KuitoDevTheme.font(15)
            rest.textColor = KuitoDevTheme.muted
            rest.numberOfLines = 0
            column.addArrangedSubview(rest)
        }

        return column
    }

    /// The code frame, with the failing line lit and its location a link.
    private func source(_ code: KuitoLogBox.CodeFrame) -> UIView {
        var configuration = UIButton.Configuration.plain()

        configuration.title = "\(code.file):\(code.line):\(code.column)"
        configuration.image = UIImage(systemName: "arrow.up.forward", withConfiguration: UIImage.SymbolConfiguration(pointSize: 12, weight: .bold))
        configuration.imagePlacement = .trailing
        configuration.imagePadding = 6
        configuration.contentInsets = .zero
        configuration.baseForegroundColor = KuitoDevTheme.accent
        configuration.titleLineBreakMode = .byTruncatingHead
        configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var attributes = attributes

            attributes.font = KuitoDevTheme.code(13, .semibold)

            return attributes
        }

        let link = UIButton(configuration: configuration, primaryAction: UIAction { [weak self] _ in
            self?.open(code.file, code.line, code.column)
        })

        link.contentHorizontalAlignment = .leading

        // Lines are padded to one width so the failing line's tint spans the card.
        let lines = code.text.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        let width = lines.map(\.count).max() ?? 0
        let text = NSMutableAttributedString()

        for (offset, line) in lines.enumerated() {
            let number = Int(line.split(separator: "|").first?.trimmingCharacters(in: .whitespaces) ?? "")
            let caret = line.trimmingCharacters(in: .whitespaces).hasPrefix(":")
            let failing = number == code.line
            var attributes: [NSAttributedString.Key: Any] = [
                .font: KuitoDevTheme.code(12.5),
                .foregroundColor: caret ? KuitoDevTheme.danger : (failing ? KuitoDevTheme.text : KuitoDevTheme.muted),
            ]

            if failing { attributes[.backgroundColor] = KuitoDevTheme.danger.withAlphaComponent(0.18) }

            let shown = (caret ? line.replacingOccurrences(of: ":", with: " ") : line)
                .padding(toLength: width + 2, withPad: " ", startingAt: 0)

            text.append(NSAttributedString(string: (offset > 0 ? "\n" : "") + shown, attributes: attributes))
        }

        let frame = UILabel()

        frame.attributedText = text
        frame.numberOfLines = 0

        let scroller = UIScrollView()

        scroller.showsHorizontalScrollIndicator = false
        scroller.alwaysBounceHorizontal = true
        frame.translatesAutoresizingMaskIntoConstraints = false
        scroller.addSubview(frame)

        NSLayoutConstraint.activate([
            frame.leadingAnchor.constraint(equalTo: scroller.contentLayoutGuide.leadingAnchor, constant: 14),
            frame.trailingAnchor.constraint(equalTo: scroller.contentLayoutGuide.trailingAnchor, constant: -14),
            frame.topAnchor.constraint(equalTo: scroller.contentLayoutGuide.topAnchor, constant: 12),
            frame.bottomAnchor.constraint(equalTo: scroller.contentLayoutGuide.bottomAnchor, constant: -12),
            frame.heightAnchor.constraint(equalTo: scroller.frameLayoutGuide.heightAnchor, constant: -24),
        ])

        let card = UIStackView(arrangedSubviews: [link, surface(scroller)])

        card.axis = .vertical
        card.spacing = 8

        // Long lines start scrolled so the caret is in view.
        let gutter = lines.first { $0.contains("|") }.map { $0.prefix { $0 != "|" }.count + 2 } ?? 0
        let advance = ("0" as NSString).size(withAttributes: [.font: KuitoDevTheme.code(12.5)]).width
        let caret = advance * CGFloat(gutter + code.column - 1) + 14

        DispatchQueue.main.async {
            let limit = max(0, scroller.contentSize.width - scroller.bounds.width)

            scroller.contentOffset.x = min(limit, max(0, caret - scroller.bounds.width * 0.6))
        }

        return card
    }

    private func stack(_ entry: KuitoLogBox.Entry) -> UIView {
        let column = UIStackView(arrangedSubviews: [sectionTitle("Call stack")])

        column.axis = .vertical
        column.spacing = 8

        guard !entry.frames.isEmpty else {
            guard !entry.rawFrames.isEmpty else {
                column.addArrangedSubview(note("No stack trace"))

                return column
            }

            let raw = UILabel()

            raw.text = ((connected ? ["Mapping to your source…", ""] : []) + entry.rawFrames).joined(separator: "\n")
            raw.font = KuitoDevTheme.code(12)
            raw.textColor = KuitoDevTheme.muted
            raw.numberOfLines = 0
            column.addArrangedSubview(raw)

            return column
        }

        let app = entry.frames.filter { $0.kind == .app }
        let framework = entry.frames.count - app.count
        // An error inside Kuito has no app frames; its own frames are the story.
        let shown = showsFramework || app.isEmpty ? entry.frames : app
        let rows = UIStackView(arrangedSubviews: shown.map(row))

        rows.axis = .vertical
        column.addArrangedSubview(surface(rows))

        if framework > 0 && !app.isEmpty {
            let toggle = UIButton(type: .system)

            toggle.setTitle(showsFramework ? "Hide Kuito and library frames" : "Show \(framework) Kuito and library frames", for: .normal)
            toggle.titleLabel?.font = KuitoDevTheme.font(13, .semibold)
            toggle.tintColor = KuitoDevTheme.muted
            toggle.contentHorizontalAlignment = .leading
            toggle.addAction(UIAction { [weak self] _ in
                self?.showsFramework.toggle()
                self?.refresh()
            }, for: .touchUpInside)
            column.addArrangedSubview(toggle)
        }

        return column
    }

    private func row(_ frame: KuitoLogBox.Frame) -> UIView {
        let name = UILabel()
        let location = UILabel()
        let app = frame.kind == .app

        name.text = frame.name.isEmpty ? "<anonymous>" : frame.name
        name.font = KuitoDevTheme.code(13.5, .semibold)
        name.textColor = app ? KuitoDevTheme.text : KuitoDevTheme.muted
        location.text = frame.location ?? frame.kind.rawValue
        location.font = KuitoDevTheme.code(11.5)
        location.textColor = KuitoDevTheme.muted
        location.lineBreakMode = .byTruncatingHead

        let text = UIStackView(arrangedSubviews: [name, location])

        text.axis = .vertical
        text.spacing = 2

        let control = UIControl()
        let row = UIStackView(arrangedSubviews: [text])

        row.alignment = .center
        row.isUserInteractionEnabled = false
        row.isLayoutMarginsRelativeArrangement = true
        row.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 10, leading: 14, bottom: 10, trailing: 14)

        if let file = frame.file, let line = frame.line {
            let chevron = UIImageView(image: UIImage(systemName: "arrow.up.forward"))

            chevron.tintColor = KuitoDevTheme.muted
            chevron.setContentHuggingPriority(.required, for: .horizontal)
            row.addArrangedSubview(chevron)
            control.addAction(UIAction { [weak self] _ in self?.open(file, line, frame.column ?? 1) }, for: .touchUpInside)
        }

        row.translatesAutoresizingMaskIntoConstraints = false
        control.addSubview(row)

        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: control.leadingAnchor),
            row.trailingAnchor.constraint(equalTo: control.trailingAnchor),
            row.topAnchor.constraint(equalTo: control.topAnchor),
            row.bottomAnchor.constraint(equalTo: control.bottomAnchor),
        ])

        return control
    }

    private func actions() -> UIView {
        let dismissEntry = action("Dismiss", primary: false) { [weak self] in
            guard let self else { return }

            self.logBox.dismiss(self.entryId)
        }
        let copy = action("Copy", primary: false) { [weak self] in
            guard let self, let entry = self.logBox.entries.first(where: { $0.id == self.entryId }) else { return }

            UIPasteboard.general.string = self.logBox.report(entry)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
        let reload = action("Reload", primary: true) { [weak self] in
            self?.dismiss(animated: true)
            self?.onReload?()
        }
        let row = UIStackView(arrangedSubviews: [dismissEntry, copy, reload])

        row.distribution = .fillEqually
        row.spacing = 10

        return row
    }

    // MARK: - Behaviour

    private func page(_ step: Int) {
        let entries = logBox.entries

        guard let index = entries.firstIndex(where: { $0.id == entryId }),
              entries.indices.contains(index + step) else { return }

        turn(to: entries[index + step].id)
    }

    private func open(_ file: String, _ line: Int, _ column: Int) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        onOpen?(file, line, column)
    }

    // MARK: - Pieces

    private func color(_ level: KuitoLogBox.Level) -> UIColor {
        level == .warn ? KuitoDevTheme.warning : KuitoDevTheme.danger
    }

    private func label(_ level: KuitoLogBox.Level) -> String {
        switch level {
        case .warn: "Warning"
        case .error: "Error"
        case .fatal: "Failed to run"
        }
    }

    private func sectionTitle(_ text: String) -> UILabel {
        let label = UILabel()

        label.text = text.uppercased()
        label.font = KuitoDevTheme.font(12, .bold)
        label.textColor = KuitoDevTheme.muted

        return label
    }

    private func note(_ text: String) -> UILabel {
        let label = UILabel()

        label.text = text
        label.font = KuitoDevTheme.font(14)
        label.textColor = KuitoDevTheme.muted

        return label
    }

    private func surface(_ child: UIView) -> UIView {
        let card = UIView()

        card.backgroundColor = KuitoDevTheme.surface
        card.layer.cornerRadius = 16
        card.layer.cornerCurve = .continuous
        card.layer.borderWidth = 1
        card.layer.borderColor = KuitoDevTheme.hairline.cgColor
        card.clipsToBounds = true
        child.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(child)

        NSLayoutConstraint.activate([
            child.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            child.trailingAnchor.constraint(equalTo: card.trailingAnchor),
            child.topAnchor.constraint(equalTo: card.topAnchor),
            child.bottomAnchor.constraint(equalTo: card.bottomAnchor),
        ])

        return card
    }

    private func iconButton(_ symbol: String, label: String, _ handler: @escaping () -> Void) -> UIButton {
        let button = UIButton(type: .system)

        button.setImage(UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 14, weight: .bold)), for: .normal)
        button.tintColor = KuitoDevTheme.text
        button.accessibilityLabel = label
        button.addAction(UIAction { _ in handler() }, for: .touchUpInside)
        button.widthAnchor.constraint(equalToConstant: 30).isActive = true

        return button
    }

    private func action(_ title: String, primary: Bool, _ handler: @escaping () -> Void) -> UIButton {
        var configuration = UIButton.Configuration.filled()

        configuration.title = title
        configuration.cornerStyle = .capsule
        configuration.baseBackgroundColor = primary ? KuitoDevTheme.accent : KuitoDevTheme.raised
        configuration.baseForegroundColor = KuitoDevTheme.text
        configuration.contentInsets = NSDirectionalEdgeInsets(top: 14, leading: 12, bottom: 14, trailing: 12)
        configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var attributes = attributes

            attributes.font = KuitoDevTheme.font(15, .semibold)

            return attributes
        }

        return UIButton(configuration: configuration, primaryAction: UIAction { _ in handler() })
    }
}

/// A tinted capsule label: the entry's level.
private final class PaddedLabel: UILabel {
    init(text: String, color: UIColor) {
        super.init(frame: .zero)
        self.text = text
        font = KuitoDevTheme.font(11, .heavy)
        textColor = color
        backgroundColor = color.withAlphaComponent(0.16)
        layer.cornerRadius = 8
        layer.masksToBounds = true
        setContentHuggingPriority(.required, for: .horizontal)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override var intrinsicContentSize: CGSize {
        let size = super.intrinsicContentSize

        return CGSize(width: size.width + 16, height: size.height + 8)
    }

    override func drawText(in rect: CGRect) {
        super.drawText(in: rect.insetBy(dx: 8, dy: 4))
    }
}
