/// `Select` in native/modules/select/select.ts: a view and nothing else.
final class KuitoSelectModule: SelectSpec {
    init(context: KuitoModuleContext) {}

    func view() -> KuitoModuleView {
        KuitoModuleView(KuitoSelectView.self, KuitoSelectView.define)
    }
}
