/// `Slider` in native/modules/slider/slider.ts: a view and nothing else.
final class KuitoSliderModule: SliderSpec {
    init(context: KuitoModuleContext) {}

    func view() -> KuitoModuleView {
        KuitoModuleView(KuitoSliderView.self, KuitoSliderView.define)
    }
}
