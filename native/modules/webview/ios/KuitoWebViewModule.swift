import UIKit
import WebKit

/// `WebView` in native/modules/webview/webview.ts: a view and its methods.
final class KuitoWebViewModule: WebViewSpec {
    init(context: KuitoModuleContext) {}

    func view() -> KuitoModuleView {
        KuitoModuleView(KuitoWebView.self) { view in
            // `src` and `html` are two ways to say what loads; a reset clears only its own.
            view.prop("src") { (web, source: KuitoWebSource?) in web.load(source, replacing: .remote) }
            view.prop("html") { (web, page: KuitoWebPage?) in
                web.load(page.map { .html($0.html, baseURL: $0.baseURL) }, replacing: .page)
            }
            view.prop("allowedOrigins") { (web, patterns: [String]?) in
                web.whitelist = KuitoOriginWhitelist(patterns ?? KuitoOriginWhitelist.defaults)
            }
            view.prop("injectedJavaScript") { (web, script: String?) in web.injectedJavaScript = script }
            view.prop("javaScriptEnabled") { (web, enabled: Bool?) in web.javaScriptEnabled = enabled ?? true }
            view.prop("swipeNavigation") { (web, allows: Bool?) in
                web.allowsBackForwardNavigationGestures = allows ?? false
            }
            view.prop("userAgent") { (web, agent: String?) in web.customUserAgent = agent }
        }
    }

    @MainActor func goBack(_ view: UIView) throws {
        _ = try web(view).goBack()
    }

    @MainActor func goForward(_ view: UIView) throws {
        _ = try web(view).goForward()
    }

    @MainActor func reload(_ view: UIView) throws {
        _ = try web(view).reload()
    }

    @MainActor func stop(_ view: UIView) throws {
        try web(view).stopLoading()
    }

    @MainActor func injectJavaScript(_ view: UIView, _ script: String) throws {
        try web(view).evaluateJavaScript(script)
    }

    @MainActor func postMessage(_ view: UIView, _ data: String) throws {
        try web(view).post(data)
    }

    @MainActor private func web(_ view: UIView) throws -> KuitoWebView {
        guard let web = view as? KuitoWebView else {
            throw KuitoModuleError(KuitoErrorCode.viewNotFound, "The view is not a WebView")
        }

        return web
    }
}

/// A URL with its request headers, or inline HTML resolved against a base URL.
enum KuitoWebSource: Decodable, Equatable {
    case uri(URL, headers: [String: String])
    case html(String, baseURL: URL?)

    /// Which prop says what loads: `src` or `html`.
    enum Kind { case remote, page }

    var kind: Kind {
        switch self {
        case .uri: .remote
        case .html: .page
        }
    }

    private enum Keys: String, CodingKey { case uri, headers }

    /// `src`: a URL string, or `{ uri, headers? }`.
    init(from decoder: Decoder) throws {
        // The object first: the module decoder reads any JSON value as text.
        guard let source = try? decoder.container(keyedBy: Keys.self), source.contains(.uri) else {
            let text = try decoder.singleValueContainer().decode(String.self)

            guard let url = URL(string: text), url.scheme != nil else {
                throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "not a URL"))
            }

            self = .uri(url, headers: [:])
            return
        }

        guard let url = URL(string: try source.decode(String.self, forKey: .uri)), url.scheme != nil else {
            throw DecodingError.dataCorruptedError(forKey: .uri, in: source, debugDescription: "not a URL")
        }

        self = .uri(url, headers: try source.decodeIfPresent([String: String].self, forKey: .headers) ?? [:])
    }
}

/// `html`: the page's HTML, or `{ html, baseUrl? }`.
struct KuitoWebPage: Decodable {
    let html: String
    let baseURL: URL?

    private enum Keys: String, CodingKey { case html, baseUrl }

    init(from decoder: Decoder) throws {
        // The object first: the module decoder reads any JSON value as text.
        guard let page = try? decoder.container(keyedBy: Keys.self), page.contains(.html) else {
            html = try decoder.singleValueContainer().decode(String.self)
            baseURL = nil
            return
        }

        html = try page.decode(String.self, forKey: .html)
        baseURL = try page.decodeIfPresent(String.self, forKey: .baseUrl).flatMap(URL.init(string:))
    }
}

/// The page's state, as every load and navigation event carries it.
private struct KuitoWebNavigation: Encodable, Equatable {
    let url: String
    let title: String
    let loading: Bool
    let canGoBack: Bool
    let canGoForward: Bool
}

private struct KuitoWebError: Encodable {
    let url: String
    let title: String
    let loading: Bool
    let canGoBack: Bool
    let canGoForward: Bool
    let code: Int
    let description: String
}

private struct KuitoWebMessage: Encodable {
    let data: String
    let url: String
}

final class KuitoWebView: WKWebView, KuitoNativeView, WKNavigationDelegate, WKUIDelegate {
    private static let bridgeName = "kuitoWebView"
    /// The page's only way to the app. A frozen object, so a page script can't swap `postMessage`.
    private static let bridge = WKUserScript(
        source: """
        window.KuitoWebView = Object.freeze({
          postMessage: function (data) { window.webkit.messageHandlers.\(bridgeName).postMessage(String(data)); }
        });
        """,
        injectionTime: .atDocumentStart,
        forMainFrameOnly: true)

    private let events: KuitoViewEvents
    private var source: KuitoWebSource?
    /// The URL a `source` load starts at: it loads whatever the whitelist says.
    private var sourceURL: URL?
    private var observations: [NSKeyValueObservation] = []
    private var reported: KuitoWebNavigation?

    var whitelist = KuitoOriginWhitelist(KuitoOriginWhitelist.defaults)
    var javaScriptEnabled = true
    var injectedJavaScript: String? {
        didSet { installScripts() }
    }

    init(events: KuitoViewEvents) {
        self.events = events

        let configuration = WKWebViewConfiguration()

        // Media plays in the page, as in Safari, rather than full screen.
        configuration.allowsInlineMediaPlayback = true
        super.init(frame: .zero, configuration: configuration)
        configuration.userContentController.add(KuitoWebMessages(self), name: Self.bridgeName)
        installScripts()
        navigationDelegate = self
        uiDelegate = self
        #if DEBUG
        if #available(iOS 16.4, *) { isInspectable = true }
        #endif
        // A same-document navigation (history.pushState) changes the URL without a load.
        let report = { (web: KuitoWebView) in MainActor.assumeIsolated { web.reportState() } }

        observations = [
            observe(\.url) { web, _ in report(web) },
            observe(\.title) { web, _ in report(web) },
            observe(\.isLoading) { web, _ in report(web) },
            observe(\.canGoBack) { web, _ in report(web) },
            observe(\.canGoForward) { web, _ in report(web) },
        ]
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    /// A reset (nil) of one prop clears the page only if that prop loaded it.
    func load(_ next: KuitoWebSource?, replacing kind: KuitoWebSource.Kind) {
        if next == nil, source?.kind != kind { return }

        guard next != source else { return }

        source = next

        switch next {
        case .uri(let url, let headers):
            var request = URLRequest(url: url)

            headers.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
            sourceURL = url
            load(request)
        case .html(let html, let baseURL):
            sourceURL = baseURL
            loadHTMLString(html, baseURL: baseURL)
        case nil:
            sourceURL = nil
            loadHTMLString("", baseURL: nil)
        }
    }

    /// A `message` event on the page's window, as `window.postMessage` dispatches one.
    func post(_ data: String) {
        guard let literal = try? JSONSerialization.data(withJSONObject: data, options: .fragmentsAllowed) else { return }

        evaluateJavaScript("window.dispatchEvent(new MessageEvent('message', { data: \(String(decoding: literal, as: UTF8.self)) }));")
    }

    fileprivate func received(_ message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame else { return }

        events.emit("message", KuitoWebMessage(data: message.body as? String ?? "", url: url?.absoluteString ?? ""))
    }

    private func installScripts() {
        let scripts = configuration.userContentController

        scripts.removeAllUserScripts()
        scripts.addUserScript(Self.bridge)

        if let injectedJavaScript {
            scripts.addUserScript(WKUserScript(source: injectedJavaScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
    }

    private func navigation() -> KuitoWebNavigation {
        KuitoWebNavigation(
            url: url?.absoluteString ?? "", title: title ?? "", loading: isLoading,
            canGoBack: canGoBack, canGoForward: canGoForward)
    }

    private func reportState() {
        let state = navigation()

        guard state != reported else { return }

        reported = state
        events.emit("navigate", state)
    }

    private func failed(_ error: Error) {
        let error = error as NSError

        // A load another load replaced, or one stopped on purpose.
        guard error.code != NSURLErrorCancelled else { return }

        let state = navigation()

        events.emit("error", KuitoWebError(
            url: error.userInfo[NSURLErrorFailingURLStringErrorKey] as? String ?? state.url, title: state.title,
            loading: false, canGoBack: state.canGoBack, canGoForward: state.canGoForward,
            code: error.code, description: error.localizedDescription))
        events.emit("loadEnd", state)
    }

    // MARK: WKNavigationDelegate

    func webView(
        _ webView: WKWebView, decidePolicyFor action: WKNavigationAction, preferences: WKWebpagePreferences,
        decisionHandler: @escaping @MainActor (WKNavigationActionPolicy, WKWebpagePreferences) -> Void
    ) {
        preferences.allowsContentJavaScript = javaScriptEnabled

        guard let url = action.request.url, action.targetFrame?.isMainFrame ?? true else {
            return decisionHandler(.allow, preferences)
        }

        let allowed = url == sourceURL || [.backForward, .reload].contains(action.navigationType) || whitelist.allows(url)

        if url == sourceURL { sourceURL = nil }

        // Only a link the user followed leaves the app; a page can't open other apps on its own.
        if !allowed, action.navigationType == .linkActivated { KuitoLinks.shared.open(url) }

        decisionHandler(allowed ? .allow : .cancel, preferences)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        events.emit("loadStart", self.navigation())
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let state = self.navigation()

        events.emit("load", state)
        events.emit("loadEnd", state)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        failed(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        failed(error)
    }

    // MARK: WKUIDelegate

    /// `target="_blank"` and `window.open` load in this view, through the whitelist.
    func webView(
        _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
        for action: WKNavigationAction, windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if action.targetFrame == nil { load(action.request) }

        return nil
    }
}

/// The script message handler, apart from the view: WebKit holds it strongly.
private final class KuitoWebMessages: NSObject, WKScriptMessageHandler {
    private weak var web: KuitoWebView?

    init(_ web: KuitoWebView) {
        self.web = web
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        web?.received(message)
    }
}

/// Origins as wildcard patterns, `https://*.example.com`, matched against a
/// URL's scheme and host, as react-native-webview's `originWhitelist`.
struct KuitoOriginWhitelist {
    static let defaults = ["http://*", "https://*"]

    private let patterns: [NSRegularExpression]

    init(_ patterns: [String]) {
        self.patterns = patterns.compactMap {
            let pattern = NSRegularExpression.escapedPattern(for: $0).replacingOccurrences(of: "\\*", with: ".*")

            return try? NSRegularExpression(pattern: "^\(pattern)$", options: .caseInsensitive)
        }
    }

    /// about: pages (`about:blank`, a page's `srcdoc`) are always allowed.
    func allows(_ url: URL) -> Bool {
        let text = url.absoluteString

        if url.scheme == "about" { return true }

        guard let origin = text.range(of: "^[A-Za-z][A-Za-z0-9+.-]*:(//)?[^/?#]*", options: .regularExpression) else { return false }

        let candidate = String(text[origin])

        return patterns.contains { $0.firstMatch(in: candidate, range: NSRange(candidate.startIndex..., in: candidate)) != nil }
    }
}
