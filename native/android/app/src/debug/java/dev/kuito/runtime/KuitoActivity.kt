package dev.kuito.runtime

import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.widget.FrameLayout
import dev.kuito.runtime.devtools.ConnectionState
import dev.kuito.runtime.devtools.KuitoDevChrome
import dev.kuito.runtime.devtools.KuitoDevLink
import dev.kuito.runtime.devtools.KuitoDevSocket
import dev.kuito.runtime.devtools.KuitoFrameReceipts
import dev.kuito.runtime.renderer.KuitoAblation
import dev.kuito.runtime.devtools.KuitoDevTheme
import dev.kuito.runtime.devtools.KuitoDevtools
import dev.kuito.runtime.devtools.KuitoDevtoolsSheet
import dev.kuito.runtime.devtools.KuitoInspector
import dev.kuito.runtime.devtools.KuitoShakeDetector
import dev.kuito.runtime.logbox.KuitoLogBox
import dev.kuito.runtime.logbox.KuitoLogInspector
import dev.kuito.runtime.shell.KuitoSplash
import okhttp3.OkHttpClient
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * The development shell: the app Live Patched by the dev server, under the
 * dev chrome ([KuitoDevChrome]). It owns the dev link, the debugger and
 * the LogBox.
 */
class KuitoActivity : KuitoHostActivity() {
    // Pings detect a dead dev link; the socket reconnects on its own.
    private val client = OkHttpClient.Builder().pingInterval(10, TimeUnit.SECONDS).build()
    private lateinit var devtools: KuitoDevtools
    private lateinit var chrome: KuitoDevChrome
    private val logBox = KuitoLogBox()
    private val receipts = KuitoFrameReceipts { window.decorView.display?.refreshRate ?: 60f }
    private var logInspector: KuitoLogInspector? = null
    private var socket: KuitoDevSocket? = null
    /** DevTools' way in (docs/devtools.md); one for the activity, so a debugging session carries over reloads. */
    private val debugger by lazy { KuitoInspector(client, applicationContext) }
    private var sheet: KuitoDevtoolsSheet? = null
    private val shake by lazy { KuitoShakeDetector(this, ::toggleDevtools) }
    /** The source the app runs, bundled or patched: the server's replay of it is skipped. */
    private var latestSource: String? = null
    /** The last patch the dev server sent, so Reload restarts the current app. */
    private var patchedSource: String? = null

    override val inspector get() = debugger.handle

    override val blankBackground get() = KuitoDevTheme.ink

    override fun onCreate(savedInstanceState: Bundle?) {
        KuitoDevLink.load(this)
        devtools = KuitoDevtools(this, KuitoDevLink.url)
        super.onCreate(savedInstanceState)
        // The bundled app is bytecode; its source says which Live Patch it already is,
        // so the server's replay of that same build on connect is skipped.
        latestSource = try {
            engine.asset("app.js").decodeToString()
        } catch (error: java.io.IOException) {
            failed("The app's source, app.js, is missing", error.message, "", true)
            null
        }
        devtools.reconnect = ::connect
        devtools.reload = ::reload

        connect()
    }

    override fun install(root: FrameLayout) {
        chrome = KuitoDevChrome(this, root, devtools, logBox, onPill = ::toggleDevtools, onOpenLog = { inspect(null) })
        renderer.devtools = chrome.componentsOverlay(renderer, engine::event)
        installReceipts()
        chrome.loading("Loading your app…")
    }

    /**
     * Every dropped frame goes to the LogBox, `kuito dev` and the performance
     * monitor with what ran in it (docs/performance.md#frame-receipts).
     */
    private fun installReceipts() {
        receipts.nameView = { id -> renderer.nodes[id]?.let { KuitoFrameReceipts.name(id, it.kind, it.label) } ?: "view $id" }
        receipts.onFrame = chrome::frame
        receipts.onDrop = { line, warn ->
            chrome.showDrop(line)
            log(if (warn) "warn" else "info", line, "")
        }
        receipts.start()

        KuitoAblation.error().takeIf { it.isNotEmpty() }?.let { log("error", it, "") }
        KuitoAblation.setting().takeIf { it.isNotEmpty() }?.let {
            log("warn", "debug.kuito.ablate=$it: this run slows or skips that work, to measure what it costs (docs/performance.md#ablation)", "")
        }
    }

    override fun rendered(view: View) = chrome.rendered(view)

    // Devtools access: ⌘M or the menu key, shake, or `m` in kuito dev.

    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        val shortcut = keyCode == KeyEvent.KEYCODE_MENU ||
            (keyCode == KeyEvent.KEYCODE_M && (event.isMetaPressed || event.isCtrlPressed))

        if (!shortcut) return super.onKeyUp(keyCode, event)

        toggleDevtools()

        return true
    }

    override fun onResume() {
        super.onResume()
        shake.start()
    }

    override fun onPause() {
        shake.stop()
        super.onPause()
    }

    private fun toggleDevtools() {
        sheet?.let {
            it.dismiss()
            sheet = null

            return
        }

        sheet = KuitoDevtoolsSheet(this, devtools).apply {
            setOnDismissListener { sheet = null }
            show()
        }
    }

    // LogBox

    /** Every console entry prints in logcat and the terminal; warnings and errors also show here. */
    override fun log(level: String, message: String, stack: String) {
        Log.println(if (level == "log" || level == "info" || level == "debug") Log.INFO else Log.WARN, "Kuito", "[$level] $message")

        val entry = logBox.record(level, message, stack)
        val wire = JSONObject()
            .put("type", KuitoDeviceMessage.LOG.type)
            .put("level", level)
            .put("message", message)
            .put("stack", stack)

        entry?.let { wire.put("id", it.id) }
        socket?.send(wire)
        if (entry?.level == KuitoLogBox.Level.FATAL) inspect(entry.id)
    }

    private fun inspect(id: String?) {
        val entry = id ?: logBox.entries.lastOrNull()?.id ?: return

        logInspector?.let { return it.turnTo(entry) }

        logInspector = KuitoLogInspector(
            this,
            logBox,
            entry,
            connected = devtools.connection == ConnectionState.Connected,
            onOpen = { file, line, column ->
                socket?.send(
                    JSONObject().put("type", KuitoDeviceMessage.OPEN.type).put("file", file).put("line", line).put("column", column),
                )
            },
            onReload = ::reload,
        ).apply {
            setOnDismissListener { logInspector = null }
            show()
        }
    }

    // The dev link

    private fun connect() {
        socket?.stop()
        socket = KuitoDevSocket(client, devtools.url, ::connectionChanged, ::handle).also { it.start() }
        debugger.connect(devtools.url)
    }

    private fun connectionChanged(state: ConnectionState) {
        val wasDisconnected = devtools.connection is ConnectionState.Retrying

        // Each connection starts by saying which device this is.
        if (state == ConnectionState.Connected) hello()

        devtools.connection = state
        chrome.connection(state, wasDisconnected)
    }

    /** The Live Patch link's messages (src/protocol/dev-link.ts, KuitoDevLink.generated.kt). */
    private fun handle(message: JSONObject) {
        when (KuitoServerMessage.of(message.optString("type"))) {
            KuitoServerMessage.PATCH -> applyPatch(message.getString("source"), message.optInt("revision"))
            KuitoServerMessage.COMMAND -> command(message.optString("name"))
            KuitoServerMessage.SYMBOLICATED -> logBox.symbolicated(message)
            null -> Unit
        }
    }

    private fun command(name: String) {
        if (name == "devtools") toggleDevtools()
        if (name == "record") sendRecording()
    }

    // Recordings (docs/devtools.md#recording-and-replay)

    /** Answers `record`: the runtime's batches so far and the view tree they built. */
    private fun sendRecording() {
        engine.recording { recording, error ->
            if (recording == null) return@recording failed("Recording failed", error)

            socket?.send(
                JSONObject()
                    .put("type", KuitoDeviceMessage.RECORDING.type)
                    .put("recording", android.util.Base64.encodeToString(recording, android.util.Base64.NO_WRAP))
                    .put("tree", renderer.describeTree()),
            )
        }
    }

    private fun hello() {
        val name = Settings.Global.getString(contentResolver, Settings.Global.DEVICE_NAME) ?: Build.MODEL
        val id = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: name

        socket?.send(
            JSONObject().put("type", KuitoDeviceMessage.HELLO.type).put("id", id).put("name", name).put("platform", "android"),
        )
    }

    private fun applyPatch(source: String, revision: Int) {
        // A reconnect replays the server's last patch: it is live already.
        if (!engine.isRunning) return
        if (source == latestSource) return acknowledge(revision, 0.0)

        latestSource = source
        patchedSource = source

        chrome.patching()
        engine.patch(source, revision) { error, milliseconds ->
            if (error != null) {
                socket?.send(
                    JSONObject()
                        .put("type", KuitoDeviceMessage.REJECTED.type)
                        .put("revision", revision)
                        .put("code", KuitoPatchRejection.EVALUATION)
                        .put("message", error),
                )

                return@patch
            }

            acknowledge(revision, milliseconds)
            logBox.clearFatal()
            devtools.patched(revision, milliseconds)
            chrome.patched(milliseconds)
        }
    }

    /** Acks a patch the engine evaluated, with how long evaluating it took. */
    private fun acknowledge(revision: Int, milliseconds: Double) {
        socket?.send(JSONObject().put("type", KuitoDeviceMessage.APPLIED.type).put("revision", revision).put("ms", milliseconds))
    }

    /** Restarts the app in a fresh Hermes runtime. */
    private fun reload() {
        chrome.restarting()
        engine.close()
        logBox.clear()
        renderer.clear()
        chrome.loading("Loading your app…")
        // The last patch, or unpatched the bundled bytecode again.
        engine.start(patchedSource)
    }

    /** A failure of `what`; a JavaScript error brings its own message and stack. Code that failed to run is fatal. */
    override fun failed(what: String, cause: String?, stack: String, fatal: Boolean) {
        devtools.failed(listOfNotNull(what, cause).joinToString(": "))
        log(if (fatal || !chrome.hasFirstFrame) "fatal" else "error", cause?.let { "$it\n$what" } ?: what, stack)

        // Code that failed to run leaves nothing to hand off to: show why.
        if (fatal) KuitoSplash.dismiss()

        chrome.failed(what)
    }

    override fun onDestroy() {
        receipts.stop()
        socket?.stop()
        super.onDestroy()
        debugger.stop()
        client.dispatcher.executorService.shutdown()
    }
}
