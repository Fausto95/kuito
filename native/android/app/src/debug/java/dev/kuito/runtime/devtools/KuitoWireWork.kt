package dev.kuito.runtime.devtools

/**
 * JSON every runtime made and parsed to cross a boundary since launch, and the
 * display frames the UI runtime drained batches on (native/shared/WireWork.h).
 */
data class KuitoWireWork(val frames: Long, val jsonParses: Long, val bytesStringified: Long) {
    companion object {
        init {
            System.loadLibrary("kuito_mobile")
        }

        /** What every session's runtimes counted so far. Any thread. */
        fun read(): KuitoWireWork = counters().let { KuitoWireWork(it[0], it[1], it[2]) }

        @JvmStatic private external fun counters(): LongArray
    }
}
