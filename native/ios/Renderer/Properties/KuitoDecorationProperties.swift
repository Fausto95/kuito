import UIKit

/// Corners, clipping, borders, shadows and background gradients.
@MainActor
enum KuitoDecorationProperties {
    static let setters: [String: KuitoPropertySetter] = [
        "borderRadius": { context, value in
            context.style.cornerRadius = try context.number(value)
            context.style.applyCornerRadius(to: context.view)
            clip(context)
        },
        "overflow": { context, value in
            let overflow = value == .null ? nil : try context.keyword(value)

            try KuitoLayoutProperties.alsoLayOut(context, value)
            context.style.overflowHidden = overflow == "hidden" || overflow == "scroll"
            clip(context)
        },
        "borderWidth": { context, value in
            let width = try context.number(value)

            try KuitoLayoutProperties.alsoLayOut(context, value)
            context.view.layer.borderWidth = width
        },
        "borderColor": { context, value in context.view.layer.borderColor = try context.color(value).cgColor },
        "shadowColor": { context, value in
            let color = value == .null ? UIColor.clear : try context.color(value)
            var alpha: CGFloat = 0

            color.getRed(nil, green: nil, blue: nil, alpha: &alpha)
            context.view.layer.shadowColor = color.withAlphaComponent(1).cgColor
            context.view.layer.shadowOpacity = Float(alpha)
            context.style.hasShadow = alpha > 0
            clip(context)
        },
        "shadowRadius": { context, value in context.view.layer.shadowRadius = try context.number(value) },
        "shadowOffsetX": { context, value in context.view.layer.shadowOffset.width = try context.number(value) },
        "shadowOffsetY": { context, value in context.view.layer.shadowOffset.height = try context.number(value) },
        "backgroundGradient": { context, value in
            gradient(context.view, context.style, value == .null ? nil : try context.structure(value, KuitoPropValues.backgroundGradient))
        },
    ]

    /// Rounded corners clip content unless a shadow needs to draw outside;
    /// `overflow: hidden` always clips (and so hides the shadow, as UIKit must).
    private static func clip(_ context: KuitoPropertyContext) {
        let style = context.style

        context.view.layer.masksToBounds =
            style.overflowHidden || (style.cornerRadius > 0 && !style.hasShadow)
    }

    private static func gradient(_ view: UIView, _ style: KuitoViewStyle, _ spec: KuitoGradientValue?) {
        guard let spec else {
            style.gradient?.removeFromSuperview()
            style.gradient = nil

            return
        }

        let gradient = style.gradient ?? insertGradient(into: view)

        style.gradient = gradient
        style.applyCornerRadius(to: view)
        gradient.configure(angle: CGFloat(spec.angle), colors: spec.colors.map(UIColor.init(kuitoRGBA:)))
    }

    /// Not an arranged subview: it sits behind a stack's content. A scroll
    /// view's gradient fills its visible frame rather than its content.
    private static func insertGradient(into view: UIView) -> KuitoGradientView {
        let gradient = KuitoGradientView()
        let frame: UILayoutGuide? = (view as? UIScrollView)?.frameLayoutGuide

        gradient.isUserInteractionEnabled = false
        gradient.translatesAutoresizingMaskIntoConstraints = false
        gradient.layer.masksToBounds = true
        view.insertSubview(gradient, at: 0)

        NSLayoutConstraint.activate([
            gradient.leadingAnchor.constraint(equalTo: frame?.leadingAnchor ?? view.leadingAnchor),
            gradient.trailingAnchor.constraint(equalTo: frame?.trailingAnchor ?? view.trailingAnchor),
            gradient.topAnchor.constraint(equalTo: frame?.topAnchor ?? view.topAnchor),
            gradient.bottomAnchor.constraint(equalTo: frame?.bottomAnchor ?? view.bottomAnchor),
        ])

        return gradient
    }
}
