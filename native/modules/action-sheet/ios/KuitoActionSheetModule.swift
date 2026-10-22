import UIKit

/// `ActionSheet` in native/modules/action-sheet/action-sheet.ts:
/// UIAlertController's action sheet, a popover on iPad that points at the
/// anchor, or the middle of the window without one.
final class KuitoActionSheetModule: ActionSheetSpec {
    private var open: [ObjectIdentifier: UIAlertController] = [:]

    init(context: KuitoModuleContext) {}

    @MainActor func show(_ request: ActionSheetRequest, _ promise: KuitoPromise<ActionSheetAnswer>) {
        guard let host = KuitoPresenter.top() else {
            return promise.reject("ERR_NO_WINDOW", "There is no window to show the action sheet in")
        }

        let sheet = UIAlertController(title: request.title, message: request.message, preferredStyle: .actionSheet)
        let id = ObjectIdentifier(sheet)
        let cancel = request.cancelButtonIndex.map(Int.init)
        let destructive = Set(request.destructiveButtonIndices.map(Int.init))
        let disabled = Set(request.disabledButtonIndices.map(Int.init))
        let settle = { [weak self] (index: Int?) in
            self?.open[id] = nil
            promise.resolve(ActionSheetAnswer(index: index.map(Double.init)))
        }

        for (index, option) in request.options.enumerated() {
            let style: UIAlertAction.Style = index == cancel ? .cancel
                : destructive.contains(index) ? .destructive : .default
            let action = UIAlertAction(title: option, style: style) { _ in settle(index) }

            action.isEnabled = !disabled.contains(index)
            sheet.addAction(action)
        }

        // iPad needs a popover. An anchor makes one on iPhone too (iOS 26);
        // without one, iPhone keeps the sheet at the bottom of the screen.
        let popover = request.anchor != nil || host.traitCollection.horizontalSizeClass == .regular

        // A popover closes on a tap outside it, which only a cancel action
        // hears, and doesn't show that action.
        if popover, cancel == nil {
            sheet.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in settle(nil) })
        }

        if popover { Self.anchor(sheet, in: host.view, at: request.anchor) }

        let tint = request.tintColor.map(UIColor.init(kuitoHex:))

        sheet.overrideUserInterfaceStyle = request.userInterfaceStyle.ui
        sheet.view.tintColor = tint
        open[id] = sheet
        // UIKit resets the tint while presenting.
        host.present(sheet, animated: true) { tint.map { sheet.view.tintColor = $0 } }
    }

    func destroy() {
        MainActor.assumeIsolated {
            open.values.forEach { $0.dismiss(animated: false) }
            open = [:]
        }
    }

    @MainActor private static func anchor(_ sheet: UIAlertController, in view: UIView, at point: ActionSheetAnchor?) {
        guard let popover = sheet.popoverPresentationController else { return }

        let center = CGPoint(x: view.bounds.midX, y: view.bounds.midY)
        let target = point.map { view.convert(CGPoint(x: $0.x, y: $0.y), from: view.window) } ?? center

        popover.sourceView = view
        popover.sourceRect = CGRect(origin: target, size: .zero)
        popover.permittedArrowDirections = point == nil ? [] : .any
    }
}

private extension ActionSheetInterfaceStyle {
    var ui: UIUserInterfaceStyle {
        switch self {
        case .unspecified: .unspecified
        case .light: .light
        case .dark: .dark
        }
    }
}
