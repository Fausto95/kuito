/// `Drawing` in native/modules/drawing/drawing.ts: a view and nothing else.
final class KuitoDrawingModule: DrawingSpec {
    init(context: KuitoModuleContext) {}

    func view() -> KuitoModuleView {
        KuitoModuleView(KuitoDrawingView.self, KuitoDrawingView.define)
    }
}
