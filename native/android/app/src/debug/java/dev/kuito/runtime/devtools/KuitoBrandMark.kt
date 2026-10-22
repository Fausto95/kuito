package dev.kuito.runtime.devtools

import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.view.View
import kotlin.math.min

/**
 * Kuito's caracal, drawn from the brand master
 * (apps/website/public/kuito-mark.svg, a 512 by 512 view box) and scaled to
 * fit. Each path carries the mark's gradient across its own bounds, as the
 * SVG's bounding-box gradient does. test/brand-mark.test.ts keeps the paths
 * and stops equal to the master's.
 */
class KuitoBrandMark(context: Context) : View(context) {
    private val shapes = PATHS.map { (data, evenOdd) ->
        parse(data).apply { fillType = if (evenOdd) Path.FillType.EVEN_ODD else Path.FillType.WINDING }
    }
    private val paints = shapes.map { path ->
        val box = RectF().also { path.computeBounds(it, true) }

        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = LinearGradient(
                box.left,
                box.top,
                box.left + box.width() * 0.65f,
                box.bottom,
                STOPS.map { (_, rgb) -> OPAQUE or rgb }.toIntArray(),
                STOPS.map { (offset, _) -> offset }.toFloatArray(),
                Shader.TileMode.CLAMP,
            )
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        val scale = min(width, height) / VIEW_BOX

        canvas.save()
        canvas.translate((width - VIEW_BOX * scale) / 2, (height - VIEW_BOX * scale) / 2)
        canvas.scale(scale, scale)
        shapes.forEachIndexed { index, path -> canvas.drawPath(path, paints[index]) }
        canvas.restore()
    }

    private companion object {
        const val VIEW_BOX = 512f
        const val OPAQUE = 0xFF shl 24

        val PATHS = listOf(
            "M92.39 48 99.38 203.63 122.32 245.53 103.37 298.4 102.37 317.35 179.18 391.18 213.1 441.06 259.99 464 304.88 440.06 329.82 395.17 369.73 352.27 385.69 324.34 382.7 247.52 406.64 206.62 420.6 56.98 415.62 50.99 381.7 119.83 325.83 195.65 306.88 213.6 289.92 219.59 354.76 262.48 369.73 259.49 373.72 288.42 369.73 327.33 298.9 421.1 279.94 405.14 251.01 252.51 189.16 203.63 127.31 112.84Z M134 265C154 280 176 294 189 302 199 308 206 318 210 339L218 370 209 400C183 369 148 344 125 321L120 306Z" to true,
            "M344.79 291.41 310.87 311.37 301.89 332.32 303.88 340.3 315.86 326.33 334.81 313.36 345.78 297.4Z" to false,
            "M179 301C191 305 202 315 206 326 192 320 184 315 179 301Z" to false,
        )
        val STOPS = listOf(
            0f to 0xDCC9FF,
            0.55f to 0xAA91FF,
            1f to 0x785CE8,
        )

        /**
         * SVG path data as the master writes it: absolute M, L, C and Z, with a
         * command's coordinates repeating it (after M, as L).
         */
        fun parse(data: String): Path {
            val tokens = Regex("[A-Za-z]|-?[0-9]*\\.?[0-9]+").findAll(data).map { it.value }.toList()
            val path = Path()
            var index = 0
            var command = "M"

            fun number(): Float =
                tokens.getOrNull(index++)?.toFloatOrNull() ?: error("KuitoBrandMark: malformed path data at token ${index - 1}")

            while (index < tokens.size) {
                if (tokens[index].first().isLetter()) {
                    command = tokens[index++]

                    if (command == "Z") {
                        path.close()
                        continue
                    }
                }

                when (command) {
                    "M" -> {
                        path.moveTo(number(), number())
                        command = "L"
                    }
                    "L" -> path.lineTo(number(), number())
                    "C" -> path.cubicTo(number(), number(), number(), number(), number(), number())
                    else -> error("KuitoBrandMark: unsupported path command $command")
                }
            }

            return path
        }
    }
}
