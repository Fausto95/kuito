import UIKit

/// Background gradient drawn by a CAGradientLayer behind the view's content.
final class KuitoGradientView: UIView {
    override class var layerClass: AnyClass { CAGradientLayer.self }

    func configure(angle: CGFloat, colors: [UIColor]) {
        guard let gradient = layer as? CAGradientLayer else { return }
        gradient.colors = colors.map(\.cgColor)
        // CSS angles: 0deg points up, 90deg right; convert to unit-square points.
        let radians = angle * .pi / 180
        let dx = sin(radians) / 2, dy = -cos(radians) / 2
        gradient.startPoint = CGPoint(x: 0.5 - dx, y: 0.5 - dy)
        gradient.endPoint = CGPoint(x: 0.5 + dx, y: 0.5 + dy)
    }
}
