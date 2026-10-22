package dev.kuito.runtime.modules.window

import dev.kuito.link.WindowInsets
import dev.kuito.link.WindowMetrics
import dev.kuito.link.WindowOrientation
import dev.kuito.link.WindowSpec
import dev.kuito.runtime.link.KuitoSignal
import dev.kuito.runtime.modules.KuitoModuleContext
import dev.kuito.runtime.shell.KuitoWindowMetrics

/** `Window` in native/modules/window/window.ts. */
class KuitoWindowModule(@Suppress("unused") private val context: KuitoModuleContext) : WindowSpec {
    private var observation: (() -> Unit)? = null

    override fun metrics() = metrics(KuitoWindowMetrics.current)

    override fun startMetrics(signal: KuitoSignal<WindowMetrics>) {
        observation = KuitoWindowMetrics.observe { signal.set(metrics(it)) }
    }

    override fun stopMetrics() {
        observation?.invoke()
        observation = null
    }

    private fun metrics(metrics: KuitoWindowMetrics.Metrics) = WindowMetrics(
        width = metrics.width,
        height = metrics.height,
        insets = WindowInsets(top = metrics.insets[0], left = metrics.insets[1], bottom = metrics.insets[2], right = metrics.insets[3]),
        orientation = if (metrics.orientation == "landscape") WindowOrientation.LANDSCAPE else WindowOrientation.PORTRAIT,
    )
}
