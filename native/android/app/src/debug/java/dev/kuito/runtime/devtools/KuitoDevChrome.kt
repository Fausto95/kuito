package dev.kuito.runtime.devtools

import android.app.Activity
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import dev.kuito.runtime.logbox.KuitoLogBox
import dev.kuito.runtime.logbox.KuitoLogToast
import dev.kuito.runtime.shell.KuitoSplash
import dev.kuito.runtime.renderer.KuitoAndroidRenderer
import dev.kuito.runtime.renderer.KuitoDevtoolsOverlay
import dev.kuito.runtime.renderer.KuitoDevtoolsSelectPayload
import dev.kuito.runtime.renderer.KuitoDevtoolsUpdatesPayload
import dev.kuito.runtime.renderer.KuitoEventEmitter
import dev.kuito.runtime.renderer.KuitoEventRecord

/**
 * What the development shell draws over the app in [root]: the loading
 * screen until the app's first frame, then the patch pill; the LogBox toast,
 * the performance monitor, the update highlighter and the Components panel's
 * outlines and picker.
 */
class KuitoDevChrome(
    private val activity: Activity,
    private val root: FrameLayout,
    private val devtools: KuitoDevtools,
    logBox: KuitoLogBox,
    onPill: () -> Unit,
    onOpenLog: () -> Unit,
) {
    private val highlighter = KuitoUpdateHighlighter(activity)
    private val monitor = KuitoPerformanceMonitor(activity, devtools)
    private val pill = KuitoPatchPill(activity, onPill)
    private val logToast = KuitoLogToast(activity, onOpen = onOpenLog, onDismiss = logBox::clear)
    private var loading = KuitoLoadingView(activity)
    /** Tells the kernel whether updates are highlighted; set with the Components overlay. */
    private var events: KuitoEventEmitter? = null
    /** What the kernel last heard of Highlight updates; null until it asks. */
    private var reportedUpdates: Boolean? = null

    /** Whether the app has drawn: until then the loading screen says what happens. */
    var hasFirstFrame = false
        private set

    init {
        root.addView(highlighter, FrameLayout.LayoutParams(-1, -1))
        root.addView(monitor)
        root.addView(pill, FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.CENTER_HORIZONTAL))
        root.addView(logToast, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM))
        logBox.observe { logToast.show(logBox) }
        root.addView(loading, FrameLayout.LayoutParams(-1, -1))
        loading.show("Starting Hermes…")

        // Overlays stay clear of the status bar.
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())

            (pill.layoutParams as FrameLayout.LayoutParams).topMargin = bars.top + dp(8f)
            pill.requestLayout()
            (logToast.layoutParams as FrameLayout.LayoutParams).setMargins(dp(12f), 0, dp(12f), bars.bottom + dp(8f))
            logToast.requestLayout()
            monitor.place()
            insets
        }

        devtools.observe(::applySettings)
    }

    fun loading(text: String) = loading.show(text)

    /** A view the app updated; the first one ends the loading screen. */
    /** A display frame's verdict, for the performance monitor ([KuitoFrameReceipts]). */
    fun frame(frameTimeNanos: Long, interval: Double, work: Double, dropped: Int) = monitor.frame(frameTimeNanos, interval, work, dropped)

    /** The last dropped frame's receipt. */
    fun showDrop(line: String) = monitor.showDrop(line)

    fun rendered(view: View) {
        if (devtools.highlightsUpdates) highlighter.updated(view)

        if (hasFirstFrame) return

        hasFirstFrame = true

        // The splash is the loading screen at launch: it goes in the frame
        // the app shows, so nothing of the dev loading view may show under it.
        if (KuitoSplash.isVisible) root.removeView(loading) else root.post { loading.finish() }

        KuitoSplash.firstFrame()
    }

    /** Before the app's first frame the loading screen says it; after, the pill does. */
    fun connection(state: ConnectionState, wasDisconnected: Boolean) {
        if (hasFirstFrame) {
            when {
                state is ConnectionState.Retrying -> pill.disconnected(state.delayMs)
                state == ConnectionState.Connected && wasDisconnected -> pill.reconnected()
            }

            return
        }

        loading.show(when (state) {
            ConnectionState.Connecting -> "Connecting to the dev server…"
            ConnectionState.Connected -> "Waiting for your app…"
            is ConnectionState.Retrying ->
                if (state.reason == REFUSED_TOKEN) state.reason
                else "Dev server not reachable. Retrying in ${(state.delayMs + 999) / 1000}s…"
        })
    }

    fun patching() {
        if (hasFirstFrame) pill.updating()
    }

    fun patched(milliseconds: Double) {
        if (hasFirstFrame) pill.updated(milliseconds)
    }

    fun failed(what: String) {
        if (hasFirstFrame) pill.failed() else loading.show(what)
    }

    /** The app restarts: a new loading screen until its first frame. */
    fun restarting() {
        hasFirstFrame = false
        loading = KuitoLoadingView(activity)
        root.addView(loading, FrameLayout.LayoutParams(-1, -1))
    }

    /** The Components panel's outlines and tap-to-select (docs/devtools.md), over [renderer]. */
    internal fun componentsOverlay(renderer: KuitoAndroidRenderer, sendEvent: (Int, String, KuitoEventRecord) -> Boolean): KuitoDevtoolsOverlay {
        val events = KuitoEventEmitter(sendEvent).also { this.events = it }

        return object : KuitoDevtoolsOverlay {
            private val picker by lazy { KuitoInspectOverlay(activity, ::pick) }

            override fun highlight(views: List<View>) {
                highlighter.outline(views)
                applySettings()
            }

            override fun inspect(enabled: Boolean) {
                (picker.parent as? FrameLayout)?.removeView(picker)
                if (enabled) root.addView(picker, FrameLayout.LayoutParams(-1, -1))
            }

            override fun hello() {
                reportedUpdates = null
                reportUpdates()
            }

            override fun cause(view: View, text: String) = highlighter.caused(view, text)

            /** The kernel finds the component that rendered the view, and ends the inspection. */
            private fun pick(x: Float, y: Float) {
                val id = renderer.idAt(x, y) ?: return

                events.emit(0, "devtools.select", KuitoDevtoolsSelectPayload(id.toDouble()))
            }
        }
    }

    /** The kernel names each update's cause only while the highlighter shows it. */
    private fun reportUpdates() {
        val events = events ?: return
        val on = devtools.highlightsUpdates

        if (reportedUpdates == on) return

        reportedUpdates = on
        events.emit(0, "devtools.updates", KuitoDevtoolsUpdatesPayload(on))
    }

    private fun applySettings() {
        monitor.visibility = if (devtools.showsPerformance) View.VISIBLE else View.GONE
        highlighter.visibility = if (devtools.highlightsUpdates || highlighter.hasOutlines) View.VISIBLE else View.GONE

        if (devtools.showsPerformance) monitor.start() else monitor.stop()

        monitor.place()
        reportUpdates()
    }

    private fun dp(value: Float) = KuitoDevTheme.dp(activity, value)
}
