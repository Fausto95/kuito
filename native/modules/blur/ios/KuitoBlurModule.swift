/// `Blur` in native/modules/blur/blur.ts: a view and nothing else.
final class KuitoBlurModule: BlurSpec {
    init(context: KuitoModuleContext) {}

    func view() -> KuitoModuleView {
        KuitoModuleView(KuitoBlurView.self, KuitoBlurView.define)
    }
}
