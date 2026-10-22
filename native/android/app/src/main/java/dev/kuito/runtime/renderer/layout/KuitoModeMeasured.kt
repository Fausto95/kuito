package dev.kuito.runtime.renderer.layout

/** MeasureMode in native/shared/layout/FlexLayout.h. */
internal object KuitoMeasureMode {
    const val EXACTLY = 0
    const val AT_MOST = 1
    const val UNDEFINED = 2
    const val MIN_CONTENT = 3
}

/** A leaf that answers the engine's measure modes itself: content-box sizes in dp. */
internal interface KuitoModeMeasured {
    fun measure(width: Float, widthMode: Int, height: Float, heightMode: Int): Pair<Float, Float>
}
