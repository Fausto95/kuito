import UIKit

/// `Drawing` in native/modules/drawing/drawing.ts: a CAShapeLayer per shape,
/// later shapes over earlier ones, inside a layer that fits the viewBox to
/// the view. A shape's path is its `d` as the shared parser reads it
/// (native/shared/PathData.h), transformed by its layer, so a stroke scales
/// with its shape as SVG's does. Its props are defined here, beside the
/// view, so the renderer tests reach them without the generated spec.
final class KuitoDrawingView: UIView, KuitoNativeView {
    static func define(_ view: KuitoViewDefinition<KuitoDrawingView>) {
        view.prop("viewBox") { (drawing, value: ViewBox?) in drawing.viewBox = value }
        view.prop("shapes") { (drawing, value: [Shape]?) in drawing.shapes = value ?? [] }
    }

    /// The user space `[x, y, width, height]`, with a size to fit.
    struct ViewBox: Decodable {
        let rect: CGRect

        init(from decoder: Decoder) throws {
            let numbers = try decoder.singleValueContainer().decode([Double].self)

            guard numbers.count == 4, numbers[2] > 0, numbers[3] > 0 else {
                throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "a viewBox is [x, y, width, height] with a size"))
            }

            rect = CGRect(x: numbers[0], y: numbers[1], width: numbers[2], height: numbers[3])
        }
    }

    /// A shape as src/native/drawing-shapes.ts draws it: every field given.
    struct Shape: Decodable {
        let path: CGPath
        let fill: CGColor?
        let fillRule: CAShapeLayerFillRule
        let stroke: CGColor?
        let strokeWidth: CGFloat
        let strokeLinecap: CAShapeLayerLineCap
        let strokeLinejoin: CAShapeLayerLineJoin
        let strokeMiterlimit: CGFloat
        let strokeDasharray: [NSNumber]
        let strokeDashoffset: CGFloat
        let opacity: Float
        let transform: CGAffineTransform

        private enum Key: String, CodingKey {
            case d, fill, fillRule, stroke, strokeWidth, strokeLinecap, strokeLinejoin, strokeMiterlimit
            case strokeDasharray, strokeDashoffset, opacity, transform
        }

        init(from decoder: Decoder) throws {
            let fields = try decoder.container(keyedBy: Key.self)
            let corrupted = { (key: Key, reason: String) in
                DecodingError.dataCorrupted(.init(codingPath: fields.codingPath + [key], debugDescription: reason))
            }

            do {
                path = try KuitoPathData.path(try fields.decode(String.self, forKey: .d))
            } catch let error as DecodingError {
                throw error
            } catch {
                throw corrupted(.d, error.localizedDescription)
            }

            fill = try fields.decodeIfPresent(String.self, forKey: .fill).map { UIColor(kuitoHex: $0).cgColor }
            stroke = try fields.decodeIfPresent(String.self, forKey: .stroke).map { UIColor(kuitoHex: $0).cgColor }
            fillRule = try fields.decode(String.self, forKey: .fillRule) == "evenodd" ? .evenOdd : .nonZero
            strokeWidth = try fields.decode(CGFloat.self, forKey: .strokeWidth)

            let caps: [String: CAShapeLayerLineCap] = ["butt": .butt, "round": .round, "square": .square]
            let joins: [String: CAShapeLayerLineJoin] = ["miter": .miter, "round": .round, "bevel": .bevel]
            let cap = try fields.decode(String.self, forKey: .strokeLinecap)
            let join = try fields.decode(String.self, forKey: .strokeLinejoin)

            guard let lineCap = caps[cap] else { throw corrupted(.strokeLinecap, "no line cap \(cap)") }
            guard let lineJoin = joins[join] else { throw corrupted(.strokeLinejoin, "no line join \(join)") }

            strokeLinecap = lineCap
            strokeLinejoin = lineJoin
            strokeMiterlimit = try fields.decode(CGFloat.self, forKey: .strokeMiterlimit)
            strokeDasharray = try fields.decode([Double].self, forKey: .strokeDasharray).map { NSNumber(value: $0) }
            strokeDashoffset = try fields.decode(CGFloat.self, forKey: .strokeDashoffset)
            opacity = try fields.decode(Float.self, forKey: .opacity)

            let m = try fields.decode([CGFloat].self, forKey: .transform)

            guard m.count == 6 else { throw corrupted(.transform, "a transform is [a, b, c, d, e, f]") }

            transform = CGAffineTransform(a: m[0], b: m[1], c: m[2], d: m[3], tx: m[4], ty: m[5])
        }
    }

    /// Holds the shapes' layers in user space.
    let canvas = CALayer()

    private var viewBox: ViewBox? {
        didSet { setNeedsLayout() }
    }

    private var shapes: [Shape] = [] {
        didSet { draw() }
    }

    init(events: KuitoViewEvents) {
        super.init(frame: .zero)
        canvas.anchorPoint = .zero
        layer.addSublayer(canvas)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    /// SVG's default fit, xMidYMid meet: the viewBox scaled whole into the
    /// view and centered, its origin at the view's origin.
    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }

        guard let box = viewBox?.rect else { return canvas.setAffineTransform(.identity) }

        let scale = min(bounds.width / box.width, bounds.height / box.height)
        let x = (bounds.width - box.width * scale) / 2 - box.minX * scale
        let y = (bounds.height - box.height * scale) / 2 - box.minY * scale

        canvas.setAffineTransform(CGAffineTransform(a: scale, b: 0, c: 0, d: scale, tx: x, ty: y))
    }

    private func draw() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }

        canvas.sublayers?.forEach { $0.removeFromSuperlayer() }

        for shape in shapes {
            let layer = CAShapeLayer()

            layer.anchorPoint = .zero
            layer.path = shape.path
            layer.fillColor = shape.fill
            layer.fillRule = shape.fillRule
            layer.strokeColor = shape.stroke
            layer.lineWidth = shape.strokeWidth
            layer.lineCap = shape.strokeLinecap
            layer.lineJoin = shape.strokeLinejoin
            layer.miterLimit = shape.strokeMiterlimit
            layer.lineDashPattern = shape.strokeDasharray.isEmpty ? nil : shape.strokeDasharray
            layer.lineDashPhase = shape.strokeDashoffset
            layer.opacity = shape.opacity
            layer.setAffineTransform(shape.transform)
            canvas.addSublayer(layer)
        }
    }
}
