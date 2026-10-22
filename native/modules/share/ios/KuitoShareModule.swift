import UIKit

/// `Share` in native/modules/share/share.ts.
final class KuitoShareModule: ShareSpec {
    init(context: KuitoModuleContext) {}

    @MainActor func share(_ request: ShareRequest, _ promise: KuitoPromise<ShareResult>) {
        guard let host = KuitoPresenter.top() else {
            return promise.reject("ERR_NO_WINDOW", "There is no window to show the share sheet in")
        }

        let items: [Any]

        do {
            items = try Self.items(request)
        } catch {
            return promise.reject(error)
        }

        let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)

        sheet.excludedActivityTypes = request.excludedActivityTypes?.map(UIActivity.ActivityType.init(rawValue:))
        sheet.completionWithItemsHandler = { type, completed, _, error in
            if let error { return promise.reject(error) }

            promise.resolve(completed
                ? ShareResult(action: .shared, activityType: type?.rawValue)
                : ShareResult(action: .dismissed, activityType: nil))
        }

        // iPad shows the sheet as a popover, which needs an anchor.
        if let popover = sheet.popoverPresentationController {
            popover.sourceView = host.view
            popover.sourceRect = CGRect(x: host.view.bounds.midX, y: host.view.bounds.midY, width: 0, height: 0)
            popover.permittedArrowDirections = []
        }

        host.present(sheet, animated: true)
    }

    private static func items(_ request: ShareRequest) throws -> [Any] {
        let url = try request.url.map { text -> URL in
            guard let url = URL(string: text) else { throw KuitoModuleError("ERR_URL", "\(text) is not a URL") }

            return url
        }
        let items: [Any] = [request.message as Any?, url as Any?].compactMap { $0 }

        return items.map { ShareItem($0, subject: request.subject) }
    }
}

/// One shared item; it also gives activities that take one, like Mail, the subject.
private final class ShareItem: NSObject, UIActivityItemSource {
    private let item: Any
    private let subject: String?

    init(_ item: Any, subject: String?) {
        self.item = item
        self.subject = subject
    }

    func activityViewControllerPlaceholderItem(_ controller: UIActivityViewController) -> Any { item }

    func activityViewController(_ controller: UIActivityViewController,
                                itemForActivityType activityType: UIActivity.ActivityType?) -> Any? { item }

    func activityViewController(_ controller: UIActivityViewController,
                                subjectForActivityType activityType: UIActivity.ActivityType?) -> String {
        subject ?? ""
    }
}
