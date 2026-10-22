/// `ContextMenu` in native/modules/context-menu/context-menu.ts: a view and nothing else.
final class KuitoContextMenuModule: ContextMenuSpec {
    init(context: KuitoModuleContext) {}

    func view() -> KuitoModuleView {
        KuitoModuleView(KuitoContextMenuView.self, KuitoContextMenuView.define)
    }
}
