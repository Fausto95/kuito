package dev.kuito.runtime.renderer.drawing

import android.graphics.Path

/** A Drawing Path's `d`, read by the shared parser (native/shared/PathData.h). Pure, so any thread may parse. */
object KuitoPathData {
    init {
        System.loadLibrary("kuito_mobile")
    }

    /** The path the data draws; throws IllegalArgumentException with the parser's KUITO_PATH message. */
    fun path(data: String): Path {
        val packed = parse(data)
        val path = Path()
        var at = 0

        while (at < packed.size) {
            when (packed[at++].toInt()) {
                MOVE -> path.moveTo(packed[at++], packed[at++])
                LINE -> path.lineTo(packed[at++], packed[at++])
                QUAD -> path.quadTo(packed[at++], packed[at++], packed[at++], packed[at++])
                CUBIC -> path.cubicTo(packed[at++], packed[at++], packed[at++], packed[at++], packed[at++], packed[at++])
                CLOSE -> path.close()
            }
        }
        return path
    }

    // kuito::path::Verb, in order.
    private const val MOVE = 0
    private const val LINE = 1
    private const val QUAD = 2
    private const val CUBIC = 3
    private const val CLOSE = 4

    @JvmStatic private external fun parse(data: String): FloatArray
}
