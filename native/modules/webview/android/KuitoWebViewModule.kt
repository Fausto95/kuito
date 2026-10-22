package dev.kuito.runtime.modules.webview

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Bitmap
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import dev.kuito.runtime.BuildConfig
import dev.kuito.link.WebViewSpec
import dev.kuito.runtime.link.KuitoModuleView
import dev.kuito.runtime.modules.KuitoErrorCode
import dev.kuito.runtime.modules.KuitoModuleContext
import dev.kuito.runtime.modules.KuitoModuleError
import dev.kuito.runtime.modules.KuitoType
import dev.kuito.runtime.modules.KuitoViewEvents
import dev.kuito.runtime.shell.KuitoLinks
import org.json.JSONObject
import kotlin.reflect.KClass

/** `WebView` in native/modules/webview/webview.ts: a view and its methods. */
class KuitoWebViewModule(@Suppress("UNUSED_PARAMETER") context: KuitoModuleContext) : WebViewSpec {
    override fun view(): KuitoModuleView<*> {
        val flag = KuitoType.optional(KuitoType.boolean)
        val text = KuitoType.optional(KuitoType.string)

        return KuitoModuleView(::KuitoWebView) { view ->
            // `src` and `html` are two ways to say what loads; a reset clears only its own.
            view.prop("src", KuitoType.optional(remote)) { web, source -> web.load(source, KuitoWebSource.Uri::class) }
            view.prop("html", KuitoType.optional(page)) { web, source -> web.load(source, KuitoWebSource.Html::class) }
            view.prop("allowedOrigins", KuitoType.optional(KuitoType.list(KuitoType.string))) { web, patterns ->
                web.whitelist = KuitoOriginWhitelist(patterns ?: KuitoOriginWhitelist.defaults)
            }
            view.prop("injectedJavaScript", text) { web, script -> web.injectedJavaScript = script }
            view.prop("javaScriptEnabled", flag) { web, enabled -> web.settings.javaScriptEnabled = enabled != false }
            // iOS only: Android has no swipe between pages.
            view.prop("swipeNavigation", flag) { _, _ -> }
            view.prop("userAgent", text) { web, agent -> web.settings.userAgentString = agent }
        }
    }

    override fun goBack(view: android.view.View) = web(view).goBack()

    override fun goForward(view: android.view.View) = web(view).goForward()

    override fun reload(view: android.view.View) = web(view).reload()

    override fun stop(view: android.view.View) = web(view).stopLoading()

    override fun injectJavaScript(view: android.view.View, script: String) = web(view).evaluateJavascript(script, null)

    override fun postMessage(view: android.view.View, data: String) = web(view).post(data)

    private fun web(view: android.view.View) =
        view as? KuitoWebView ?: throw KuitoModuleError(KuitoErrorCode.VIEW_NOT_FOUND, "The view is not a WebView")

    /** `src`: a URL string, or `{ uri, headers? }`. */
    private val remote = KuitoType { value ->
        when (value) {
            is String -> KuitoWebSource.Uri(value, emptyMap())
            is JSONObject -> {
                val headers = value.optJSONObject("headers")

                KuitoWebSource.Uri(value.getString("uri"), headers?.keys()?.asSequence()?.associateWith { headers.getString(it) }.orEmpty())
            }
            else -> throw KuitoModuleError("ERR_ARGUMENT", "expected a URL or { uri }, got $value")
        }
    }

    /** `html`: the page's HTML, or `{ html, baseUrl? }`. */
    private val page = KuitoType { value ->
        when (value) {
            is String -> KuitoWebSource.Html(value, null)
            is JSONObject -> KuitoWebSource.Html(value.getString("html"), value.optString("baseUrl").ifEmpty { null })
            else -> throw KuitoModuleError("ERR_ARGUMENT", "expected HTML or { html }, got $value")
        }
    }
}

/** A URL with its request headers, or inline HTML resolved against a base URL. */
sealed interface KuitoWebSource {
    data class Uri(val uri: String, val headers: Map<String, String>) : KuitoWebSource
    data class Html(val html: String, val baseUrl: String?) : KuitoWebSource
}

@SuppressLint("SetJavaScriptEnabled", "ViewConstructor")
class KuitoWebView(context: Context, private val events: KuitoViewEvents) : WebView(context) {
    private val main = Handler(Looper.getMainLooper())
    private var source: KuitoWebSource? = null
    private var reported: Map<String, Any?>? = null
    /** A main-frame load is in progress: onPageFinished also fires for same-document navigations, which have no start. */
    private var loading = false
    /** Whether the load in progress failed: onPageFinished follows an error too. */
    private var failed = false

    var whitelist = KuitoOriginWhitelist(KuitoOriginWhitelist.defaults)
    var injectedJavaScript: String? = null

    init {
        settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // No file or content URLs, from the app or from a page.
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
        }
        // Process-wide: every WebView in the app is inspectable in a debug build.
        setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        // The page's only way to the app: window.KuitoWebView.postMessage.
        addJavascriptInterface(Bridge(), "KuitoWebView")
        webViewClient = Client()
        webChromeClient = Chrome()
    }

    /** A reset (null) of one prop clears the page only if that prop loaded it. */
    fun load(next: KuitoWebSource?, kind: KClass<out KuitoWebSource>) {
        if (next == null && !kind.isInstance(source)) return
        if (next == source) return

        source = next
        when (next) {
            is KuitoWebSource.Uri -> loadUrl(next.uri, next.headers)
            // The history URL is what `url` reports for the page: its base URL, as on iOS.
            is KuitoWebSource.Html -> loadDataWithBaseURL(next.baseUrl, next.html, "text/html", "utf-8", next.baseUrl)
            null -> loadUrl("about:blank")
        }
    }

    /** A `message` event on the page's window, as `window.postMessage` dispatches one. */
    fun post(data: String) {
        evaluateJavascript("window.dispatchEvent(new MessageEvent('message', { data: ${JSONObject.quote(data)} }));", null)
    }

    /**
     * A WebView in a scroll view scrolls itself first: the parent takes the
     * gesture back only when the page can't scroll that way.
     */
    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_DOWN) parent?.requestDisallowInterceptTouchEvent(true)

        return super.onTouchEvent(event)
    }

    override fun onOverScrolled(scrollX: Int, scrollY: Int, clampedX: Boolean, clampedY: Boolean) {
        super.onOverScrolled(scrollX, scrollY, clampedX, clampedY)

        if (clampedX || clampedY) parent?.requestDisallowInterceptTouchEvent(false)
    }

    private fun navigation(loading: Boolean): Map<String, Any?> = mapOf(
        "url" to (url ?: ""),
        "title" to (title ?: ""),
        "loading" to loading,
        "canGoBack" to canGoBack(),
        "canGoForward" to canGoForward(),
    )

    private fun reportState(loading: Boolean) {
        val state = navigation(loading)

        if (state == reported) return

        reported = state
        events.emit("navigate", state)
    }

    private fun activity(): Activity? {
        var candidate: Context? = context

        while (candidate is ContextWrapper) {
            if (candidate is Activity) return candidate
            candidate = candidate.baseContext
        }

        return null
    }

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (!request.isForMainFrame || whitelist.allows(request.url)) return false

            // Only a link the user followed leaves the app; a page can't open other apps on its own.
            if (request.hasGesture()) activity()?.let { KuitoLinks.open(it, request.url) }

            return true
        }

        override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
            loading = true
            failed = false
            // The view's `url` still names the previous page; the argument is the one loading,
            // except for inline HTML, whose argument is an internal data: URL.
            events.emit("loadStart", navigation(true) + if (url.startsWith("data:")) emptyMap() else mapOf("url" to url))
            reportState(true)
        }

        override fun onPageFinished(view: WebView, url: String) {
            if (!loading) return

            loading = false

            val state = navigation(false)

            injectedJavaScript?.let { evaluateJavascript(it, null) }
            if (!failed) events.emit("load", state)
            events.emit("loadEnd", state)
            reportState(false)
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return

            failed = true
            events.emit(
                "error",
                navigation(false) + mapOf("url" to request.url.toString(), "code" to error.errorCode, "description" to error.description.toString()),
            )
        }

        // A same-document navigation (history.pushState) changes the history without a load.
        override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
            reportState(loading)
        }
    }

    private inner class Chrome : WebChromeClient() {
        override fun onReceivedTitle(view: WebView, title: String?) {
            reportState(loading)
        }
    }

    /** Called on a WebView thread; the event leaves from the UI thread, with the page's URL. */
    private inner class Bridge {
        @JavascriptInterface
        fun postMessage(data: String?) {
            main.post { events.emit("message", mapOf("data" to (data ?: ""), "url" to (url ?: ""))) }
        }
    }
}

// Origins as wildcard patterns, "https://*.example.com", matched against a
// URL's scheme and host, as react-native-webview's `originWhitelist`. A line
// comment: the pattern's "/*" would open a nested block comment in Kotlin.
class KuitoOriginWhitelist(patterns: List<String>) {
    private val patterns = patterns.map { pattern ->
        Regex("^" + pattern.split("*").joinToString(".*") { Regex.escape(it) } + "$", RegexOption.IGNORE_CASE)
    }

    /** about: pages (`about:blank`, a page's `srcdoc`) are always allowed. */
    fun allows(url: Uri): Boolean {
        if (url.scheme == "about") return true

        val origin = ORIGIN.find(url.toString())?.value ?: return false

        return patterns.any { it.matches(origin) }
    }

    companion object {
        val defaults = listOf("http://*", "https://*")
        private val ORIGIN = Regex("^[A-Za-z][A-Za-z0-9+.-]*:(//)?[^/?#]*")
    }
}
