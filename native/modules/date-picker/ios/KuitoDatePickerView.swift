import UIKit

/// `DatePicker` in native/modules/date-picker/date-picker.ts: UIDatePicker's
/// compact style, a button that shows the moment and opens the calendar or
/// the time wheels. Its props are defined here, beside the view, so the
/// renderer tests reach them without the generated spec.
final class KuitoDatePickerView: UIDatePicker, KuitoNativeView {
    static func define(_ view: KuitoViewDefinition<KuitoDatePickerView>) {
        view.prop("value") { (picker, value: Moment?) in picker.moment = value?.date ?? Date() }
        view.prop("type") { (picker, value: Kind?) in picker.kind = value ?? .date }
        view.prop("min") { (picker, value: Moment?) in picker.minimumDate = value?.date }
        view.prop("max") { (picker, value: Moment?) in picker.maximumDate = value?.date }
        view.prop("disabled") { (picker, value: Bool?) in picker.isEnabled = !(value ?? false) }
    }

    /// Milliseconds since 1970, as JavaScript's `Date` counts them.
    struct Moment: Decodable {
        let date: Date

        init(from decoder: Decoder) throws {
            let milliseconds = try decoder.singleValueContainer().decode(Double.self)

            guard milliseconds.isFinite else {
                throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "expected milliseconds, got \(milliseconds)"))
            }

            date = Date(timeIntervalSince1970: milliseconds / 1000)
        }
    }

    enum Kind: String, Decodable {
        case date, time, datetime

        var mode: UIDatePicker.Mode {
            switch self {
            case .date: .date
            case .time: .time
            case .datetime: .dateAndTime
            }
        }

        /// What a pick in this mode changes; the rest of the moment stays.
        var shown: Set<Calendar.Component> {
            switch self {
            case .date: [.year, .month, .day]
            case .time: [.hour, .minute]
            case .datetime: [.year, .month, .day, .hour, .minute]
            }
        }
    }

    private let events: KuitoViewEvents

    /// The whole moment, with the parts the mode hides: UIDatePicker's own
    /// date need not keep them across a pick.
    private var moment = Date() {
        didSet { if date != moment { date = moment } }
    }

    private var kind = Kind.date {
        didSet { datePickerMode = kind.mode }
    }

    init(events: KuitoViewEvents) {
        self.events = events
        super.init(frame: .zero)
        preferredDatePickerStyle = .compact
        datePickerMode = kind.mode
        addAction(UIAction { [weak self] _ in self?.picked() }, for: .valueChanged)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    /// Within min and max, applied in that order as Android applies them.
    private func bounded(_ picked: Date) -> Date {
        let above = max(picked, minimumDate ?? picked)

        return min(above, maximumDate ?? above)
    }

    private func picked() {
        let calendar = Calendar.current
        let shown = calendar.dateComponents(kind.shown, from: date)
        var whole = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second, .nanosecond], from: moment)

        kind.shown.forEach { whole.setValue(shown.value(for: $0), for: $0) }
        // UIDatePicker bounds only what it shows: the kept parts can fall outside.
        moment = bounded(calendar.date(from: whole) ?? date)

        events.emit("change", Picked(value: (moment.timeIntervalSince1970 * 1000).rounded()))
    }
}

private struct Picked: Encodable {
    let value: Double
}
