package dev.kuito.runtime.devtools

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import dev.kuito.runtime.KuitoCommitStats

/**
 * A heads-up display over the app: UI-thread frames per second, the main
 * thread's longest work in a frame and the frames it dropped, a line of
 * FPS over the last 15 seconds, Kuito's commits (prop parses per commit,
 * touch-to-applied latency), the JSON crossing its boundaries per frame and
 * the last dropped frame's receipt ([KuitoFrameReceipts]). Drag it anywhere;
 * it settles in the nearest corner, which is remembered.
 */
@SuppressLint("ViewConstructor")
class KuitoPerformanceMonitor(context: Context, private val devtools: KuitoDevtools) : LinearLayout(context) {
    private val fps = TextView(context)
    private val detail = TextView(context)
    private val commits = TextView(context)
    private val wire = TextView(context)
    private val drop = TextView(context)
    private val graph = FrameGraph(context)
    private var running = false
    private var last = 0L
    private var windowStart = 0L
    private var windowFrames = 0
    private var dropped = 0
    private var windowWork = 0.0
    private var windowCommits = 0L
    private var windowParses = 0L
    private var windowWire = KuitoWireWork.read()
    private var downX = 0f
    private var downY = 0f

    init {
        orientation = HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        background = KuitoDevTheme.rounded(context, KuitoDevTheme.withAlpha(KuitoDevTheme.ink, 0.9f), 14f)
        setPadding(dp(12f), dp(8f), dp(10f), dp(8f))
        elevation = dp(6f).toFloat()
        fps.textSize = 17f
        fps.typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
        detail.textSize = 10f
        detail.typeface = Typeface.MONOSPACE
        detail.setTextColor(KuitoDevTheme.muted)
        commits.textSize = 10f
        commits.typeface = Typeface.MONOSPACE
        commits.setTextColor(KuitoDevTheme.muted)
        commits.text = "JS · no commits"
        wire.textSize = 10f
        wire.typeface = Typeface.MONOSPACE
        wire.setTextColor(KuitoDevTheme.muted)
        wire.text = "JSON · none"
        drop.textSize = 10f
        drop.typeface = Typeface.MONOSPACE
        drop.setTextColor(KuitoDevTheme.muted)
        drop.maxLines = 3
        drop.maxWidth = dp(260f)
        drop.text = "Last drop · none"

        addView(LinearLayout(context).apply {
            orientation = VERTICAL
            addView(fps)
            addView(detail)
            addView(commits)
            addView(wire)
            addView(drop)
        })
        addView(graph, LayoutParams(dp(96f), dp(34f)).apply { marginStart = dp(10f) })
    }

    /** Shows frames from now on. */
    fun start() {
        running = true
        last = 0
        dropped = 0
        windowFrames = 0
        windowWork = 0.0
    }

    fun stop() {
        running = false
    }

    /** The last dropped frame's receipt, as [KuitoFrameReceipts] words it. */
    fun showDrop(line: String) {
        drop.text = "Last drop · $line"
    }

    /** A display frame: its vsync, the display's interval and the frame rule's verdict ([KuitoFrameReceipts]). */
    fun frame(frameTimeNanos: Long, interval: Double, work: Double, frameDropped: Int) {
        if (!running) return

        if (last == 0L) {
            last = frameTimeNanos
            windowStart = frameTimeNanos

            return
        }

        last = frameTimeNanos
        windowWork = maxOf(windowWork, work)
        dropped += frameDropped
        windowFrames++

        val elapsed = frameTimeNanos - windowStart

        if (elapsed < 500_000_000L) return

        val rate = windowFrames * 1_000_000_000.0 / elapsed
        val target = 1.0 / interval
        val health = rate / target

        fps.text = "%.0f fps".format(rate)
        fps.setTextColor(if (health > 0.92) KuitoDevTheme.success else if (health > 0.7) KuitoDevTheme.warning else KuitoDevTheme.danger)
        detail.text = "UI · %.1f ms · %d dropped".format(windowWork * 1000, dropped)
        graph.add(rate, target)
        showCommits()
        showWire(windowFrames)
        windowStart = frameTimeNanos
        windowFrames = 0
        windowWork = 0.0
    }

    /** Parses per commit over the last window; the latency of the last touch the app answered. */
    private fun showCommits() {
        val count = KuitoCommitStats.commits - windowCommits
        val parses = KuitoCommitStats.parses - windowParses
        val touch = KuitoCommitStats.lastLatencyMs?.let { last ->
            " · touch %d ms (p95 %d)".format(last, KuitoCommitStats.p95LatencyMs ?: last)
        }.orEmpty()

        windowCommits = KuitoCommitStats.commits
        windowParses = KuitoCommitStats.parses

        if (count > 0 || touch.isNotEmpty())
            commits.text = (if (count > 0) "JS · %.0f parses/commit".format(parses.toDouble() / count) else "JS · idle") + touch
    }

    /**
     * JSON parsed and made per display frame over the last window, every runtime's
     * and the renderer's (docs/performance.md#json-at-the-boundary).
     */
    private fun showWire(frames: Int) {
        val work = KuitoWireWork.read()
        val per = frames.coerceAtLeast(1).toDouble()

        wire.text = "JSON · %.1f parses/frame · %.0f B/frame".format(
            (work.jsonParses - windowWire.jsonParses) / per,
            (work.bytesStringified - windowWire.bytesStringified) / per,
        )
        windowWire = work
    }

    /** Places the monitor in its remembered corner, clear of the system bars. */
    fun place() {
        val corner = devtools.monitorCorner
        val insets = (parent as? View)?.let { ViewCompat.getRootWindowInsets(it) }
            ?.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())

        layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT).apply {
            gravity = (if (corner < 2) Gravity.TOP else Gravity.BOTTOM) or (if (corner % 2 == 0) Gravity.START else Gravity.END)
            topMargin = (insets?.top ?: 0) + dp(8f)
            bottomMargin = (insets?.bottom ?: 0) + dp(8f)
            leftMargin = (insets?.left ?: 0) + dp(12f)
            rightMargin = (insets?.right ?: 0) + dp(12f)
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        val host = parent as? View ?: return false

        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = event.rawX
                downY = event.rawY
                animate().scaleX(1.04f).scaleY(1.04f).setDuration(120).start()
            }
            MotionEvent.ACTION_MOVE -> {
                translationX = event.rawX - downX
                translationY = event.rawY - downY
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                val centerX = left + width / 2f + translationX
                val centerY = top + height / 2f + translationY
                val before = intArrayOf(left + translationX.toInt(), top + translationY.toInt())

                devtools.monitorCorner = (if (centerY < host.height / 2f) 0 else 2) + (if (centerX < host.width / 2f) 0 else 1)
                place()
                // Spring from where it was released into the new corner.
                post {
                    translationX = (before[0] - left).toFloat()
                    translationY = (before[1] - top).toFloat()
                    animate().translationX(0f).translationY(0f).scaleX(1f).scaleY(1f)
                        .setInterpolator(android.view.animation.OvershootInterpolator(0.8f)).setDuration(380).start()
                }
            }
        }

        return true
    }

    private fun dp(value: Float) = KuitoDevTheme.dp(context, value)

    /** FPS over the last 15 seconds against the display's target rate. */
    private class FrameGraph(context: Context) : View(context) {
        private val samples = ArrayDeque<Double>()
        private var target = 60.0
        private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = KuitoDevTheme.dp(context, 1.5f).toFloat()
            strokeJoin = Paint.Join.ROUND
        }
        private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
        private val guide = Paint().apply { color = KuitoDevTheme.withAlpha(KuitoDevTheme.muted, 0.35f) }
        private val caption = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = KuitoDevTheme.muted
            textSize = KuitoDevTheme.dp(context, 8f).toFloat()
            typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
            textAlign = Paint.Align.RIGHT
        }

        fun add(rate: Double, target: Double) {
            samples.addLast(minOf(rate, target))

            while (samples.size > 30) samples.removeFirst()

            this.target = target
            invalidate()
        }

        override fun onDraw(canvas: Canvas) {
            if (samples.size < 2) return

            val top = KuitoDevTheme.dp(context, 8f).toFloat()
            val height = this.height - top
            val step = width / 29f
            val start = width - (samples.size - 1) * step
            val worst = samples.min() / target
            val color = if (worst > 0.92) KuitoDevTheme.success else if (worst > 0.7) KuitoDevTheme.warning else KuitoDevTheme.danger
            val path = Path()

            samples.forEachIndexed { index, sample ->
                val x = start + index * step
                val y = top + height * (1 - (sample / target)).toFloat()

                if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }

            val area = Path(path).apply {
                lineTo(start + (samples.size - 1) * step, this@FrameGraph.height.toFloat())
                lineTo(start, this@FrameGraph.height.toFloat())
                close()
            }

            canvas.drawText("%.0f".format(target), width.toFloat(), caption.textSize, caption)
            canvas.drawRect(0f, top, width - caption.textSize * 2, top + 1, guide)
            fill.color = KuitoDevTheme.withAlpha(color, 0.22f)
            canvas.drawPath(area, fill)
            line.color = color
            canvas.drawPath(path, line)
        }
    }
}
