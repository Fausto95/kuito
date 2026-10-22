/// `SegmentedControl` in native/modules/segmented-control/segmented-control.ts: a view and nothing else.
final class KuitoSegmentedControlModule: SegmentedControlSpec {
    init(context: KuitoModuleContext) {}

    func view() -> KuitoModuleView {
        KuitoModuleView(KuitoSegmentedControlView.self, KuitoSegmentedControlView.define)
    }
}
