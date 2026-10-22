import UIKit

/// `Linking` in native/modules/linking/linking.ts.
final class KuitoLinkingModule: LinkingSpec {
    private var observation: UUID?

    init(context: KuitoModuleContext) {}

    @MainActor func openURL(_ text: String, _ promise: KuitoPromise<Void>) {
        let url: URL

        do { url = try Self.url(text) } catch { return promise.reject(error) }

        KuitoLinks.shared.open(url) { opened in
            if opened { promise.resolve() } else { promise.reject("ERR_URL", "No app opens \(text)") }
        }
    }

    @MainActor func canOpenURL(_ text: String) throws -> Bool {
        UIApplication.shared.canOpenURL(try Self.url(text))
    }

    func url() -> String? {
        KuitoLinks.shared.latest?.absoluteString
    }

    // Starting sends the latest link: JavaScript read it before this ran on
    // the main thread, and drops it unless a link arrived in between.
    @MainActor func startUrl(_ signal: KuitoSignal<String?>) {
        observation = KuitoLinks.shared.observe { url in signal.set(url.absoluteString) }
        signal.set(url())
    }

    @MainActor func stopUrl() {
        observation.map(KuitoLinks.shared.cancel)
        observation = nil
    }

    private static func url(_ text: String) throws -> URL {
        guard let url = URL(string: text), url.scheme != nil else {
            throw KuitoModuleError("ERR_URL", "\(text) is not a URL")
        }

        return url
    }
}
