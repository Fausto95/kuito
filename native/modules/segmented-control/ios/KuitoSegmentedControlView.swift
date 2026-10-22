import UIKit

/// `SegmentedControl` in native/modules/segmented-control/segmented-control.ts:
/// a UISegmentedControl with a segment per option, the chosen one selected.
/// Its props are defined here, beside the view, so the renderer tests reach
/// them without the generated spec.
final class KuitoSegmentedControlView: UISegmentedControl, KuitoNativeView {
    static func define(_ view: KuitoViewDefinition<KuitoSegmentedControlView>) {
        view.prop("options") { (control, value: Options?) in control.options = value?.list ?? [] }
        view.prop("value") { (control, value: String?) in control.chosen = value }
        view.prop("disabled") { (control, value: Bool?) in control.isEnabled = !(value ?? false) }
    }

    struct Option: Decodable {
        let value: String
        let label: String
    }

    /// Options whose values differ: a value names one segment.
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
        didSet {
            removeAllSegments()
            options.enumerated().forEach { insertSegment(withTitle: $1.label, at: $0, animated: false) }
            select()
        }
    }

    private var chosen: String? {
        didSet { select() }
    }

    init(events: KuitoViewEvents) {
        self.events = events
        super.init(frame: .zero)
        addAction(UIAction { [weak self] _ in self?.picked() }, for: .valueChanged)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    private func select() {
        selectedSegmentIndex = options.firstIndex { $0.value == chosen } ?? UISegmentedControl.noSegment
    }

    private func picked() {
        guard options.indices.contains(selectedSegmentIndex) else { return }

        chosen = options[selectedSegmentIndex].value
        events.emit("change", Picked(value: options[selectedSegmentIndex].value))
    }
}

private struct Picked: Encodable {
    let value: String
}
