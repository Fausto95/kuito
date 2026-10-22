package dev.kuito.runtime.modules.drawing

import android.content.Context
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.view.View
import dev.kuito.runtime.modules.KuitoErrorCode
import dev.kuito.runtime.modules.KuitoModuleError
import dev.kuito.runtime.modules.KuitoType
import dev.kuito.runtime.modules.KuitoViewDefinition
import dev.kuito.runtime.modules.KuitoViewEvents
import dev.kuito.runtime.renderer.drawing.KuitoPathData
import dev.kuito.runtime.renderer.styling.hexColor
import org.json.JSONObject
import kotlin.math.min

/**
 * `Drawing` in native/modules/drawing/drawing.ts: each shape's `d` as the
 * shared parser reads it (native/shared/PathData.h), filled then stroked,
 * later shapes over earlier ones, inside the viewBox fitted to the view. A
 * shape's matrix applies to the canvas, so a stroke scales with its shape
 * as SVG's does. A user unit is a dp without a viewBox. Its props are
 * defined here, beside the view, as on iOS.
 */
class KuitoDrawingView(context: Context, @Suppress("UNUSED_PARAMETER") events: KuitoViewEvents) : View(context) {

    /** A shape as src/native/drawing-shapes.ts draws it, ready to paint. */
    class Shape(val path: Path, val fill: Paint?, val stroke: Paint?, val opacity: Float, val transform: Matrix)

    /** The user space `[x, y, width, height]`. */
    class ViewBox(val x: Float, val y: Float, val width: Float, val height: Float)

    var shapes = emptyList<Shape>()
        private set(next) { field = next; invalidate() }
    private var viewBox: ViewBox? = null
        set(next) { field = next; invalidate() }
    private val fit = Matrix()

    override fun onDraw(canvas: Canvas) {
        val density = resources.displayMetrics.density

        fit.reset()
        viewBox?.let { box ->
            // SVG's default, xMidYMid meet: the box scaled whole into the view and centered.
            val scale = min(width / density / box.width, height / density / box.height)

            fit.setTranslate(-box.x, -box.y)
            fit.postScale(scale, scale)
            fit.postTranslate((width / density - box.width * scale) / 2, (height / density - box.height * scale) / 2)
        }
        fit.postScale(density, density)

        for (shape in shapes) {
            val saved = if (shape.opacity < 1f) canvas.saveLayerAlpha(null, (shape.opacity * 255).toInt()) else canvas.save()

            canvas.concat(fit)
            canvas.concat(shape.transform)
            shape.fill?.let { canvas.drawPath(shape.path, it) }
            shape.stroke?.let { canvas.drawPath(shape.path, it) }
            canvas.restoreToCount(saved)
        }
    }

    companion object {
        private val viewBoxes = KuitoType { value ->
            val numbers = KuitoType.list(KuitoType.double).decode(value)

            if (numbers.size != 4 || numbers[2] <= 0 || numbers[3] <= 0)
                throw KuitoModuleError(KuitoErrorCode.ARGUMENT, "a viewBox is [x, y, width, height] with a size")
            ViewBox(numbers[0].toFloat(), numbers[1].toFloat(), numbers[2].toFloat(), numbers[3].toFloat())
        }

        private val caps = mapOf("butt" to Paint.Cap.BUTT, "round" to Paint.Cap.ROUND, "square" to Paint.Cap.SQUARE)
        private val joins = mapOf("miter" to Paint.Join.MITER, "round" to Paint.Join.ROUND, "bevel" to Paint.Join.BEVEL)

        private fun invalid(reason: String): Nothing = throw KuitoModuleError(KuitoErrorCode.ARGUMENT, reason)

        private fun shape(fields: JSONObject): Shape {
            val path = try {
                KuitoPathData.path(fields.getString("d"))
            } catch (error: IllegalArgumentException) {
                invalid(error.message.orEmpty())
            }
            val color = { key: String -> fields.opt(key)?.takeIf { it != JSONObject.NULL }?.let { hexColor(KuitoType.string.decode(it)) } }

            path.fillType = if (fields.getString("fillRule") == "evenodd") Path.FillType.EVEN_ODD else Path.FillType.WINDING

            val fill = color("fill")?.let { Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL; this.color = it } }
            val stroke = color("stroke")?.let {
                Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    style = Paint.Style.STROKE
                    this.color = it
                    strokeWidth = fields.getDouble("strokeWidth").toFloat()
                    strokeCap = caps[fields.getString("strokeLinecap")] ?: invalid("no line cap ${fields.getString("strokeLinecap")}")
                    strokeJoin = joins[fields.getString("strokeLinejoin")] ?: invalid("no line join ${fields.getString("strokeLinejoin")}")
                    strokeMiter = fields.getDouble("strokeMiterlimit").toFloat()

                    val dashes = KuitoType.list(KuitoType.double).decode(fields.get("strokeDasharray")).map(Double::toFloat)

                    // Android takes an even number of lengths; SVG repeats an odd list to make one.
                    if (dashes.isNotEmpty() && dashes.any { it > 0 })
                        pathEffect = DashPathEffect((if (dashes.size % 2 == 1) dashes + dashes else dashes).toFloatArray(), fields.getDouble("strokeDashoffset").toFloat())
                }
            }
            val m = KuitoType.list(KuitoType.double).decode(fields.get("transform")).map(Double::toFloat)

            if (m.size != 6) invalid("a transform is [a, b, c, d, e, f]")

            val transform = Matrix().apply { setValues(floatArrayOf(m[0], m[2], m[4], m[1], m[3], m[5], 0f, 0f, 1f)) }

            return Shape(path, fill, stroke, fields.getDouble("opacity").toFloat(), transform)
        }

        private val shapeList = KuitoType { value -> KuitoType.list(KuitoType.obj).decode(value).map(::shape) }

        fun define(view: KuitoViewDefinition<KuitoDrawingView>) {
            view.prop("viewBox", KuitoType.optional(viewBoxes)) { drawing, value -> drawing.viewBox = value }
            view.prop("shapes", KuitoType.optional(shapeList)) { drawing, value -> drawing.shapes = value ?: emptyList() }
        }
    }
}
