/// `DatePicker` in native/modules/date-picker/date-picker.ts: a view and nothing else.
final class KuitoDatePickerModule: DatePickerSpec {
    init(context: KuitoModuleContext) {}

    func view() -> KuitoModuleView {
        KuitoModuleView(KuitoDatePickerView.self, KuitoDatePickerView.define)
    }
}
