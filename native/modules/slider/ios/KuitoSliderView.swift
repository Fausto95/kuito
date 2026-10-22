import UIKit

/// `Slider` in native/modules/slider/slider.ts: a UISlider. Its props are
/// defined here, beside the view, so the renderer tests reach them without
/// the generated spec.
final class KuitoSliderView: UISlider, KuitoNativeView {
    static func define(_ view: KuitoViewDefinition<KuitoSliderView>) {
        view.prop("value") { (slider, value: Double?) in slider.chosen = Float(value ?? 0) }
        view.prop("min") { (slider, value: Double?) in slider.bounds(minimum: Float(value ?? 0)) }
        view.prop("max") { (slider, value: Double?) in slider.bounds(maximum: Float(value ?? 1)) }
        view.prop("step") { (slider, value: Double?) in slider.step = Float(max(value ?? 0, 0)) }
        view.prop("disabled") { (slider, value: Bool?) in slider.isEnabled = !(value ?? false) }
        view.prop("fillColor") { (slider, value: KuitoHexColor?) in slider.minimumTrackTintColor = value?.color }
        view.prop("trackColor") { (slider, value: KuitoHexColor?) in slider.maximumTrackTintColor = value?.color }
    }

    private struct SliderValue: Encodable {
        let value: Double
    }

    private let events: KuitoViewEvents

    /// The value chosen last, by the app or by the user's drag, applied
    /// again when the bounds change: UISlider clamps its value to the bounds
    /// it has when it is set. The kernel sends no value the user chose, as
    /// the view already shows it, so the drag must record it here.
    var chosen: Float = 0 {
        didSet { if value != chosen { setValue(chosen, animated: false) } }
    }

    var step: Float = 0

    init(events: KuitoViewEvents) {
        self.events = events
        super.init(frame: .zero)
        maximumValue = 1
        addAction(UIAction { [weak self] _ in self?.slid() }, for: .valueChanged)
        addAction(UIAction { [weak self] _ in self?.released() }, for: [.touchUpInside, .touchUpOutside, .touchCancel])
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    func bounds(minimum: Float? = nil, maximum: Float? = nil) {
        minimumValue = minimum ?? minimumValue
        maximumValue = maximum ?? maximumValue
        setValue(chosen, animated: false)
    }

    private func slid() {
        if step > 0 { value = minimumValue + (step * ((value - minimumValue) / step).rounded()) }

        chosen = value
        events.emit("change", SliderValue(value: Double(value)))
    }

    private func released() {
        events.emit("changeEnd", SliderValue(value: Double(value)))
    }
}
