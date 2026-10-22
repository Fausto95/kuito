import UIKit

/// `Select` in native/modules/select/select.ts: a UIKit button that shows the
/// chosen option and lists the options in its menu on a tap, the chosen one
/// checked. Not `changesSelectionAsPrimaryAction`: that always selects an
/// option, and a select may have none chosen. Its props are defined here, beside the view, so the
/// renderer tests reach them without the generated spec.
final class KuitoSelectView: UIButton, KuitoNativeView {
    static func define(_ view: KuitoViewDefinition<KuitoSelectView>) {
        view.prop("options") { (select, value: Options?) in select.options = value?.list ?? [] }
        view.prop("value") { (select, value: String?) in select.chosen = value }
        view.prop("placeholder") { (select, value: String?) in select.placeholder = value ?? "" }
        view.prop("disabled") { (select, value: Bool?) in select.isEnabled = !(value ?? false) }
    }

    struct Option: Decodable {
        let value: String
        let label: String
    }

    /// Options whose values differ: a value names one option.
    struct Options: Decodable {
        let list: [Option]

        init(from decoder: Decoder) throws {
            list = try decoder.singleValueContainer().decode([Option].self)

            guard Set(list.map(\.value)).count == list.count else {
                throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "two options have the same value"))
            }
        }
    }

    private let events: KuitoViewEvents

    private var options: [Option] = [] {
        didSet { show() }
    }

    private var chosen: String? {
        didSet { show() }
    }

    private var placeholder = "" {
        didSet { show() }
    }

    override var isEnabled: Bool {
        didSet { show() }
    }

    init(events: KuitoViewEvents) {
        self.events = events
        super.init(frame: .zero)

        var look = UIButton.Configuration.gray()

        look.image = UIImage(systemName: "chevron.up.chevron.down")
        look.imagePlacement = .trailing
        look.imagePadding = 6
        look.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(scale: .small)
        configuration = look
        showsMenuAsPrimaryAction = true
        show()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    /// What a menu action calls with its option's value: shown and sent.
    func picked(_ value: String) {
        chosen = value
        events.emit("change", Picked(value: value))
    }

    private func show() {
        let selected = options.first { $0.value == chosen }

        configuration?.title = selected?.label ?? placeholder
        configuration?.baseForegroundColor = !isEnabled ? .tertiaryLabel : selected == nil ? .secondaryLabel : .label
        menu = UIMenu(children: options.map { option in
            UIAction(title: option.label, state: option.value == selected?.value ? .on : .off) { [weak self] _ in
                self?.picked(option.value)
            }
        })
    }
}

private struct Picked: Encodable {
    let value: String
}
