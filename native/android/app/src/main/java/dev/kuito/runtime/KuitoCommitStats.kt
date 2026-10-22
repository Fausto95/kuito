package dev.kuito.runtime

import android.os.SystemClock
import android.util.Log
import dev.kuito.runtime.renderer.styling.KuitoParses

/**
 * What the performance monitor shows of Kuito commits: prop parses per
 * commit, and how long a touch waits for the app's first applied mutation
 * (the latency synchronous input commits would cut). Main thread only.
 */
object KuitoCommitStats {
    /** A touch no batch answers within this long sent nothing to apply. */
    private const val UNANSWERED_MS = 5_000L
    private const val SAMPLES = 64

    var commits = 0L
        private set
    var parses = 0L
        private set
    private var touchedAt = -1L
    private val latencies = ArrayDeque<Long>()

    /** Touch-to-applied latency of the last answered touch, in ms. */
    val lastLatencyMs get() = latencies.lastOrNull()

    /** Over the last [SAMPLES] answered touches. */
    val p95LatencyMs get() = latencies.sorted().let { sorted -> sorted.getOrNull((sorted.size * 95 + 99) / 100 - 1) }

    /** A touch went down or up at `atMs` (uptime): the next batch the app sends answers it. */
    fun touched(atMs: Long) {
        touchedAt = atMs
    }

    /**
     * Launched with the `kuito_commit_log` extra: each commit logs a `KuitoCommit` line, and frames a
     * `KuitoCommitFrames` gauge at most once a second, for scripts/benchmark-commits.ts.
     */
    var logging = false

    /** Applies a batch the JS thread sent at `sentAtMs` (uptime) in [hostCalls] calls, counting its parses and the touch it answers. */
    fun commit(sentAtMs: Long, records: Int, hostCalls: Int, apply: () -> Unit) {
        val before = KuitoParses.count
        val started = System.nanoTime()

        try {
            apply()
        } finally {
            commits++
            parses += KuitoParses.count - before

            if (logging) {
                Log.i("Kuito", "KuitoCommit records=$records calls=$hostCalls ms=${"%.3f".format((System.nanoTime() - started) / 1e6)} parses=${KuitoParses.count - before}")
            }

            val touch = touchedAt

            if (touch >= 0 && sentAtMs >= touch) {
                touchedAt = -1
                if (sentAtMs - touch <= UNANSWERED_MS) record(SystemClock.uptimeMillis() - touch)
            }
        }
    }

    private fun record(latency: Long) {
        latencies.addLast(latency)

        while (latencies.size > SAMPLES) latencies.removeFirst()
    }
}
