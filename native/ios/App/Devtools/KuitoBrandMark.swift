import UIKit

/// Kuito's caracal, drawn from the brand master
/// (apps/website/public/kuito-mark.svg, a 512 by 512 view box) and scaled to
/// fit. Each path carries the mark's gradient across its own bounds, as the
/// SVG's bounding-box gradient does. test/brand-mark.test.ts keeps the paths
/// and stops equal to the master's.
@MainActor
final class KuitoBrandMark: UIView {
    private static let viewBox: CGFloat = 512
    private static let paths: [(data: String, evenOdd: Bool)] = [
        ("M92.39 48 99.38 203.63 122.32 245.53 103.37 298.4 102.37 317.35 179.18 391.18 213.1 441.06 259.99 464 304.88 440.06 329.82 395.17 369.73 352.27 385.69 324.34 382.7 247.52 406.64 206.62 420.6 56.98 415.62 50.99 381.7 119.83 325.83 195.65 306.88 213.6 289.92 219.59 354.76 262.48 369.73 259.49 373.72 288.42 369.73 327.33 298.9 421.1 279.94 405.14 251.01 252.51 189.16 203.63 127.31 112.84Z M134 265C154 280 176 294 189 302 199 308 206 318 210 339L218 370 209 400C183 369 148 344 125 321L120 306Z", evenOdd: true),
        ("M344.79 291.41 310.87 311.37 301.89 332.32 303.88 340.3 315.86 326.33 334.81 313.36 345.78 297.4Z", evenOdd: false),
        ("M179 301C191 305 202 315 206 326 192 320 184 315 179 301Z", evenOdd: false)
    ]
    private static let stops: [(offset: NSNumber, color: UInt32)] = [
        (0, 0xDCC9FF),
        (0.55, 0xAA91FF),
        (1, 0x785CE8),
    ]
    private static let shapes = paths.map { (path: path($0.data), evenOdd: $0.evenOdd) }

    private let fills: [(gradient: CAGradientLayer, shape: CAShapeLayer)]

    override init(frame: CGRect) {
        fills = Self.shapes.map { shape in
            let gradient = CAGradientLayer()
            let mask = CAShapeLayer()

            gradient.colors = Self.stops.map { Self.color($0.color).cgColor }
            gradient.locations = Self.stops.map(\.offset)
            gradient.startPoint = .zero
            gradient.endPoint = CGPoint(x: 0.65, y: 1)
            mask.fillRule = shape.evenOdd ? .evenOdd : .nonZero
            gradient.mask = mask

            return (gradient, mask)
        }
        super.init(frame: frame)

        for fill in fills { layer.addSublayer(fill.gradient) }
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func layoutSubviews() {
        super.layoutSubviews()

        let scale = min(bounds.width, bounds.height) / Self.viewBox
        var fit = CGAffineTransform(
            translationX: (bounds.width - Self.viewBox * scale) / 2,
            y: (bounds.height - Self.viewBox * scale) / 2
        ).scaledBy(x: scale, y: scale)
        let outline = CGMutablePath()

        CATransaction.begin()
        CATransaction.setDisableActions(true)

        for (index, shape) in Self.shapes.enumerated() {
            guard let fitted = shape.path.copy(using: &fit) else { continue }

            let box = fitted.boundingBox
            var local = CGAffineTransform(translationX: -box.minX, y: -box.minY)

            fills[index].gradient.frame = box
            fills[index].shape.path = fitted.copy(using: &local)
            outline.addPath(fitted)
        }

        CATransaction.commit()
        // A shadow the caller styles (color, radius) follows the mark's outline.
        layer.shadowPath = outline
    }

    private static func color(_ rgb: UInt32) -> UIColor {
        UIColor(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }

    /// SVG path data as the master writes it: absolute M, L, C and Z, with a
    /// command's coordinates repeating it (after M, as L).
    private static func path(_ data: String) -> CGPath {
        var tokens: [String] = []
        var number = ""

        func flush() {
            if !number.isEmpty { tokens.append(number) }
            number = ""
        }

        for character in data {
            if character.isLetter {
                flush()
                tokens.append(String(character))
            } else if character == " " || character == "," {
                flush()
            } else if character == "-" {
                flush()
                number = "-"
            } else {
                number.append(character)
            }
        }

        flush()

        let path = CGMutablePath()
        var index = 0
        var command = "M"

        func point() -> CGPoint {
            guard index + 1 < tokens.count, let x = Double(tokens[index]), let y = Double(tokens[index + 1])
            else { preconditionFailure("KuitoBrandMark: malformed path data at token \(index)") }

            index += 2

            return CGPoint(x: x, y: y)
        }

        while index < tokens.count {
            if tokens[index].first?.isLetter == true {
                command = tokens[index]
                index += 1

                if command == "Z" {
                    path.closeSubpath()
                    continue
                }
            }

            switch command {
            case "M":
                path.move(to: point())
                command = "L"
            case "L":
                path.addLine(to: point())
            case "C":
                let control1 = point()
                let control2 = point()

                path.addCurve(to: point(), control1: control1, control2: control2)
            default:
                preconditionFailure("KuitoBrandMark: unsupported path command \(command)")
            }
        }

        return path
    }
}
