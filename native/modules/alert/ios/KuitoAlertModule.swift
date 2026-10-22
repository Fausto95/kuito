import UIKit

/// `Alert` in native/modules/alert/alert.ts: a UIAlertController, with text
/// fields for a prompt. iOS alerts close only through a button; a reload
/// closes the ones still open.
final class KuitoAlertModule: AlertSpec {
    private var open: [ObjectIdentifier: UIAlertController] = [:]

    init(context: KuitoModuleContext) {}

    @MainActor func alert(_ request: AlertRequest, _ promise: KuitoPromise<AlertAnswer>) {
        guard let host = KuitoPresenter.top() else {
            return promise.reject("ERR_NO_WINDOW", "There is no window to show the alert in")
        }

        let alert = UIAlertController(title: request.title, message: request.message, preferredStyle: .alert)
        let id = ObjectIdentifier(alert)

        alert.overrideUserInterfaceStyle = request.userInterfaceStyle.ui
        request.prompt.map { Self.addFields($0, to: alert) }

        for (index, button) in request.buttons.enumerated() {
            let action = UIAlertAction(title: button.text, style: button.style.action) { [weak self, weak alert] _ in
                let fields = alert?.textFields ?? []

                self?.open[id] = nil
                promise.resolve(AlertAnswer(index: Double(index), text: fields.first?.text,
                                            password: fields.count > 1 ? fields[1].text : nil))
            }

            alert.addAction(action)
            if button.preferred { alert.preferredAction = action }
        }

        open[id] = alert
        host.present(alert, animated: true)
    }

    func destroy() {
        MainActor.assumeIsolated {
            open.values.forEach { $0.dismiss(animated: false) }
            open = [:]
        }
    }

    @MainActor private static func addFields(_ prompt: AlertPrompt, to alert: UIAlertController) {
        alert.addTextField { field in
            field.text = prompt.value
            field.keyboardType = prompt.inputMode.ui
            field.isSecureTextEntry = prompt.type == .password

            if prompt.type == .login {
                field.placeholder = "Username"
                field.textContentType = .username
            }
        }

        guard prompt.type == .login else { return }

        alert.addTextField { field in
            field.placeholder = "Password"
            field.isSecureTextEntry = true
            field.textContentType = .password
        }
    }
}

private extension AlertButtonStyle {
    var action: UIAlertAction.Style {
        switch self {
        case .default: .default
        case .cancel: .cancel
        case .destructive: .destructive
        }
    }
}

private extension AlertInterfaceStyle {
    var ui: UIUserInterfaceStyle {
        switch self {
        case .unspecified: .unspecified
        case .light: .light
        case .dark: .dark
        }
    }
}

/// The keyboards TextField's `inputMode` shows (KuitoInputTraits).
private extension AlertInputMode {
    var ui: UIKeyboardType {
        switch self {
        case .text: .default
        case .decimal: .decimalPad
        case .numeric: .numberPad
        case .tel: .phonePad
        case .search: .webSearch
        case .email: .emailAddress
        case .url: .URL
        }
    }
}
