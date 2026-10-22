package dev.kuito.runtime

import android.os.Build
import android.os.Trace

/**
 * A named section in systrace/Perfetto (`atrace -a dev.kuito.shell`).
 * A trailing number (a row count) is detail; benchmarks group by the rest.
 * Costs one flag check when nobody is tracing.
 */
internal inline fun <T> traced(name: String, block: () -> T): T {
    Trace.beginSection(name)

    try {
        return block()
    } finally {
        Trace.endSection()
    }
}

/**
 * As [traced], for a name that costs a string to build: built only while a
 * trace records. Before API 29 nothing tells, so it is always built.
 */
internal inline fun <T> traced(name: () -> String, block: () -> T): T =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !Trace.isEnabled()) block() else traced(name(), block)
